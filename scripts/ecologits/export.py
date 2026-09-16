"""
Export EcoLogits impact coefficients for the models the council uses.

Run through `npm run footprint:update` (server/), which picks the EcoLogits version and
runs this with uv. Writes shared/footprint/ecologits.json — see docs/ai-footprint-meter.md.

EcoLogits' LLM model is linear per request:

    impact = per_token * output_tokens + per_generation_second * generation_seconds
    generation_seconds = min(request_seconds, output_tokens * seconds_per_token + first_token_seconds)

so each model reduces to a few constants per end of its range. The constants are read off
EcoLogits' own DAG, and golden samples from EcoLogits' public functions are stored alongside
so the TypeScript evaluator is tested against the real thing.
"""

import argparse
import json
import math
from importlib.metadata import version as installed_version

from ecologits.electricity_mix_repository import electricity_mixes
from ecologits.impacts.llm import compute_llm_impacts, compute_llm_impacts_dag
from ecologits.model_repository import ParametersMoE, models
from ecologits.tracers.utils import PROVIDER_CONFIG_MAP, llm_impacts
from ecologits.utils.range_value import RangeValue

IMPACTS = {
    # our key: (DAG usage asset, DAG embodied asset or None, EcoLogits output field)
    "energy": ("request_energy", None, "energy"),
    "gwp": ("request_usage_gwp", "request_embodied_gwp", "gwp"),
    "adpe": ("request_usage_adpe", "request_embodied_adpe", "adpe"),
    "pe": ("request_usage_pe", "request_embodied_pe", "pe"),
    "wcf": ("request_usage_wcf", None, "wcf"),
}
UNITS = {"energy": "kWh", "gwp": "kgCO2eq", "adpe": "kgSbeq", "pe": "MJ", "wcf": "L"}

INWORLD_TTS_SOURCES = [
    "https://arxiv.org/abs/2507.21138",
    "https://cloud.google.com/customers/inworld",
]
INWORLD_TTS_ASSUMPTIONS = [
    "Inworld TTS is an autoregressive SpeechLM generating 50 audio tokens per second of speech (TTS-1 technical report).",
    "Runs on Google Cloud, region unpublished: EcoLogits' google_genai data-centre profile (USA) is assumed.",
]

ELEVENLABS_ASSUMPTIONS = [
    "ElevenLabs publishes neither model size nor architecture: assumed comparable to Inworld's SpeechLMs (1.6–8.8B, 50 tokens per audio second).",
    "Responses carry x-region: europe-west4 (Google Cloud, Netherlands): EcoLogits' google_genai data-centre profile with the Dutch electricity mix is assumed.",
]

SONIOX_ASSUMPTIONS = [
    "Soniox publishes no model size: assumed in the range of open speech-recognition models (NVIDIA Parakeet TDT 0.6B to OpenAI Whisper large-v3 1.55B, rounded up to 2B).",
    "Modelled as 50 tokens per audio second (Whisper's encoder frame rate), with generation capped at real time since recognition is streamed.",
    "Soniox hosts in the US by default (EU and Japan on request); EcoLogits' generic US cloud profile (huggingface_hub: PUE 1.09–1.14, WUE 0.13–0.99) is assumed.",
]

# Keys match what the server records: "<provider>|<model>".
MODELS = {
    "inworld|mistral/mistral-large-3": {
        "ecologits": ("mistralai", "mistral-large-2512"),
        "assumptions": ["Routed through Inworld to Mistral's own API; EcoLogits' Mistral data-centre profile applies."],
    },
    "inworld|google-ai-studio/gemini-2.5-flash": {
        "ecologits": ("google_genai", "gemini-2.5-flash"),
        "assumptions": ["Routed through Inworld to Google AI Studio; EcoLogits' Google data-centre profile applies."],
    },
    "inworld|inworld-tts-1.5-max": {
        "custom": {"parameters": 8.8, "datacenter": "google_genai"},
        "usageMeasure": "audio_seconds",
        "tokensPerUnit": 50,
        "assumptions": INWORLD_TTS_ASSUMPTIONS + ["Same size as TTS-1-Max (8.8B, dense); TTS-1.5 size is unpublished."],
        "sources": INWORLD_TTS_SOURCES,
    },
    "inworld|inworld-tts-1.5-mini": {
        "custom": {"parameters": 1.6, "datacenter": "google_genai"},
        "usageMeasure": "audio_seconds",
        "tokensPerUnit": 50,
        "assumptions": INWORLD_TTS_ASSUMPTIONS + ["Same size as TTS-1 (1.6B, dense); TTS-1.5 size is unpublished."],
        "sources": INWORLD_TTS_SOURCES,
    },
    "inworld|inworld-tts-2": {
        "custom": {"parameters": RangeValue(min=1.6, max=8.8), "datacenter": "google_genai"},
        "usageMeasure": "audio_seconds",
        "tokensPerUnit": 50,
        "assumptions": INWORLD_TTS_ASSUMPTIONS + ["Size unpublished: the range of TTS-1 and TTS-1-Max (1.6–8.8B) is assumed."],
        "sources": INWORLD_TTS_SOURCES,
    },
    "inworld|soniox/stt-rt-v4": {
        "custom": {"parameters": RangeValue(min=0.6, max=2.0), "datacenter": "huggingface_hub"},
        "usageMeasure": "audio_seconds",
        "tokensPerUnit": 50,
        "assumptions": SONIOX_ASSUMPTIONS,
        "sources": [
            "https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2",
            "https://huggingface.co/openai/whisper-large-v3",
            "https://soniox.com/docs/data-residency",
        ],
    },
    "elevenlabs|eleven_flash_v2_5": {
        "custom": {"parameters": RangeValue(min=1.6, max=8.8), "datacenter": "google_genai", "zone": "NLD"},
        "usageMeasure": "audio_seconds",
        "tokensPerUnit": 50,
        "assumptions": ELEVENLABS_ASSUMPTIONS,
        "sources": INWORLD_TTS_SOURCES[:1] + ["https://elevenlabs.io/docs/overview/administration/data-residency"],
    },
}

# (usage units, request seconds or None for "not measured")
SAMPLES = [(1, 0.5), (40, 3.0), (400, 0.5), (400, 20.0), (2000, None)]


def ends(value):
    """(low, high) of a plain value or RangeValue."""
    if isinstance(value, RangeValue):
        return value.min, value.max
    return value, value


def resolve(key, spec):
    """Everything EcoLogits needs for a model, as (low, high) pairs where it can be a range."""
    if "ecologits" in spec:
        provider, name = spec["ecologits"]
        model = models.find_model(provider=provider, model_name=name)
        if model is None:
            raise SystemExit(f"{key}: EcoLogits has no model {provider}/{name}")
        params = model.architecture.parameters
        total, active = (params.total, params.active) if isinstance(params, ParametersMoE) else (params, params)
        deployment = model.deployment
        return {
            "datacenter": provider,
            "zone": PROVIDER_CONFIG_MAP[provider].datacenter_location,
            "active": ends(active),
            "total": ends(total),
            "tps": deployment.tps if deployment else None,
            "ttft": deployment.ttft if deployment else None,
            "warnings": [str(w) for w in model.warnings],
            "sources": list(model.sources),
        }
    custom = spec["custom"]
    return {
        "datacenter": custom["datacenter"],
        "zone": custom.get("zone", PROVIDER_CONFIG_MAP[custom["datacenter"]].datacenter_location),
        "active": ends(custom["parameters"]),
        "total": ends(custom["parameters"]),
        "tps": None,
        "ttft": None,
        "warnings": [],
        "sources": [],
    }


def dag(inputs, end, tokens, request_seconds):
    config = PROVIDER_CONFIG_MAP[inputs["datacenter"]]
    mix = electricity_mixes.find_electricity_mix(zone=inputs["zone"])
    return compute_llm_impacts_dag(
        model_active_parameter_count=inputs["active"][end],
        model_total_parameter_count=inputs["total"][end],
        output_token_count=tokens,
        request_latency=request_seconds,
        if_electricity_mix_adpe=mix.adpe,
        if_electricity_mix_pe=mix.pe,
        if_electricity_mix_gwp=mix.gwp,
        if_electricity_mix_wue=mix.wue,
        datacenter_pue=ends(config.datacenter_pue)[end],
        datacenter_wue=ends(config.datacenter_wue)[end],
        tps=inputs["tps"],
        ttft=inputs["ttft"],
    )


def impact_value(result, impact):
    usage, embodied, _ = IMPACTS[impact]
    return result[usage] + (result[embodied] if embodied else 0)


def coefficients(inputs, end):
    # Latency 0: generation time is 0, only the per-token part remains.
    per_token_run = dag(inputs, end, 1, 0.0)
    # A huge token count keeps the measured latency binding, so two latencies isolate the per-second part.
    tokens, short, long = 1e9, 10.0, 1000.0
    short_run, long_run = dag(inputs, end, tokens, short), dag(inputs, end, tokens, long)
    unbounded_one, unbounded_zero = dag(inputs, end, 1, math.inf), dag(inputs, end, 0, math.inf)
    return {
        "secondsPerToken": unbounded_one["generation_latency"] - unbounded_zero["generation_latency"],
        "firstTokenSeconds": unbounded_zero["generation_latency"],
        "perToken": {i: impact_value(per_token_run, i) for i in IMPACTS},
        "perGenerationSecond": {
            i: (impact_value(long_run, i) - impact_value(short_run, i)) / (long - short) for i in IMPACTS
        },
    }


def golden(key, spec, inputs, units, request_seconds):
    tokens = units * spec.get("tokensPerUnit", 1)
    latency = math.inf if request_seconds is None else request_seconds
    if "ecologits" in spec:
        provider, name = spec["ecologits"]
        result = llm_impacts(provider, name, tokens, latency)
        if result.has_errors:
            raise SystemExit(f"{key}: {result.errors}")
    else:
        config = PROVIDER_CONFIG_MAP[inputs["datacenter"]]
        mix = electricity_mixes.find_electricity_mix(zone=inputs["zone"])
        low, high = inputs["active"]
        result = compute_llm_impacts(
            model_active_parameter_count=RangeValue(min=low, max=high) if low != high else low,
            model_total_parameter_count=RangeValue(min=low, max=high) if low != high else low,
            output_token_count=tokens,
            request_latency=latency,
            if_electricity_mix_adpe=mix.adpe,
            if_electricity_mix_pe=mix.pe,
            if_electricity_mix_gwp=mix.gwp,
            if_electricity_mix_wue=mix.wue,
            datacenter_pue=config.datacenter_pue,
            datacenter_wue=config.datacenter_wue,
        )
    return {
        "units": units,
        "requestSeconds": request_seconds,
        "impacts": {i: list(ends(getattr(result, IMPACTS[i][2]).value)) for i in IMPACTS},
    }


def export(expected_version):
    actual = installed_version("ecologits")
    if expected_version and actual != expected_version:
        raise SystemExit(f"Expected EcoLogits {expected_version}, but {actual} is installed")

    out = {
        "generatedBy": "scripts/ecologits/export.py — do not edit by hand; run `npm run footprint:update` in server/",
        "ecologitsVersion": actual,
        "license": "EcoLogits (https://github.com/mlco2/ecologits) is MPL-2.0",
        "units": UNITS,
        "models": {},
    }
    for key, spec in MODELS.items():
        inputs = resolve(key, spec)
        if electricity_mixes.find_electricity_mix(zone=inputs["zone"]) is None:
            raise SystemExit(f"{key}: EcoLogits has no electricity mix for {inputs['zone']}")
        out["models"][key] = {
            "ecologitsModel": "/".join(spec["ecologits"]) if "ecologits" in spec else None,
            "usageMeasure": spec.get("usageMeasure", "output_tokens"),
            "tokensPerUnit": spec.get("tokensPerUnit", 1),
            "datacenterZone": inputs["zone"],
            "activeParameters": list(inputs["active"]),
            "totalParameters": list(inputs["total"]),
            "low": coefficients(inputs, 0),
            "high": coefficients(inputs, 1),
            "assumptions": spec.get("assumptions", []),
            "warnings": inputs["warnings"],
            "sources": inputs["sources"] + spec.get("sources", []),
            "samples": [golden(key, spec, inputs, u, s) for u, s in SAMPLES],
        }
    return out


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--expect-version")
    args = parser.parse_args()
    with open(args.out, "w") as f:
        json.dump(export(args.expect_version), f, indent=2)
        f.write("\n")
