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
from ecologits.impacts.llm import BATCH_SIZE, GPU_MEMORY, HARDWARE_LIFESPAN, compute_llm_impacts, compute_llm_impacts_dag
from ecologits.model_repository import ParametersMoE, models
from ecologits.tracers.utils import PROVIDER_CONFIG_MAP, llm_impacts
from ecologits.utils.range_value import RangeValue

IMPACTS = {
    # our key: (DAG usage asset, DAG embodied asset or None, EcoLogits output field)
    "energy": ("request_energy", None, "energy"),
    "gwp": ("request_usage_gwp", "request_embodied_gwp", "gwp"),
    "adpe": ("request_usage_adpe", "request_embodied_adpe", "adpe"),
    "wcf": ("request_usage_wcf", None, "wcf"),
}
UNITS = {"energy": "kWh", "gwp": "kgCO2eq", "adpe": "kgSbeq", "wcf": "L"}

# What each model does at the council, and how much is known about it:
#   "ecologits"  EcoLogits' own model entry
#   "corrected"  EcoLogits' method on a published size where its entry is wrong
#   "guessed"    no published size or data: EcoLogits' method on our analogy
ROLES = ("writing", "speaking", "listening")
BASES = ("ecologits", "corrected", "guessed")

INWORLD_TTS_SOURCES = [
    "https://arxiv.org/abs/2507.21138",
    "https://cloud.google.com/customers/inworld",
    "https://docs.inworld.ai/portal/regions",
]
INWORLD_HOSTING = (
    "Runs on Google Cloud in Inworld's default US deployment (api.inworld.ai; EU and India only on enterprise "
    "contracts), cloud region unpublished: EcoLogits' google_genai data-centre profile (USA) is assumed."
)
INWORLD_TTS_ASSUMPTIONS = [
    "Inworld TTS is an autoregressive SpeechLM generating 50 audio tokens per second of speech (TTS-1 technical report).",
    INWORLD_HOSTING,
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
        # Weights ship in FP8 and BF16; EcoLogits (0.11.2) assumes 16-bit for every model and has
        # announced changes to how it treats quantization. The GPU count, and with it most of
        # the estimate, depends on which one serves.
        "quantizationBits": (8, 16),
        # Mistral's API serves from Sweden by default, or the US on its US endpoint; which one
        # Inworld calls is not published. Each end of the range takes the zone that gives it.
        "zones": ("SWE", "USA"),
        "role": "writing",
        "basis": "ecologits",
        "assumptions": [
            "Routed through Inworld to Mistral's own API (Inworld reports the attempt as mistral/mistral-large-3 on its own credentials); EcoLogits' Mistral data-centre profile applies.",
            "Mistral's API runs in Sweden by default and in the US on its US endpoint; which Inworld uses is not published, so the range spans both electricity mixes.",
            "EcoLogits listed Mistral Large 3 with Mistral Large 2's size until 0.11.2, which took Mistral's published 675B total / 41B active mixture-of-experts after we reported it.",
            "Served with 8-bit (FP8, published) to 16-bit weights: EcoLogits sizes the GPU fleet by memory, so this halves or doubles the GPUs a request occupies (16 to 32 H100-class GPUs). EcoLogits itself assumes 16-bit.",
        ],
        "sources": [
            "https://help.mistral.ai/en/articles/156206-when-using-mistral-ai-s-api-where-is-my-data-stored",
            "https://github.com/mlco2/ecologits/pull/262",
            "https://huggingface.co/mistralai/Mistral-Large-3-675B-Instruct-2512-NVFP4",
        ],
    },
    "inworld|google-ai-studio/gemini-2.5-flash": {
        "ecologits": ("google_genai", "gemini-2.5-flash"),
        "role": "writing",
        "basis": "ecologits",
        "assumptions": ["Routed through Inworld to Google AI Studio; EcoLogits' Google data-centre profile applies."],
    },
    "inworld|inworld-tts-1.5-max": {
        "custom": {"parameters": 8.8, "datacenter": "google_genai"},
        "usageMeasure": "audio_seconds",
        "tokensPerUnit": 50,
        "role": "speaking",
        "basis": "guessed",
        "assumptions": INWORLD_TTS_ASSUMPTIONS + ["Same size as TTS-1-Max (8.8B, dense); TTS-1.5 size is unpublished."],
        "sources": INWORLD_TTS_SOURCES,
    },
    "inworld|inworld-tts-1.5-mini": {
        "custom": {"parameters": 1.6, "datacenter": "google_genai"},
        "usageMeasure": "audio_seconds",
        "tokensPerUnit": 50,
        "role": "speaking",
        "basis": "guessed",
        "assumptions": INWORLD_TTS_ASSUMPTIONS + ["Same size as TTS-1 (1.6B, dense); TTS-1.5 size is unpublished."],
        "sources": INWORLD_TTS_SOURCES,
    },
    "inworld|inworld-tts-2": {
        "custom": {"parameters": RangeValue(min=1.6, max=8.8), "datacenter": "google_genai"},
        "usageMeasure": "audio_seconds",
        "tokensPerUnit": 50,
        "role": "speaking",
        "basis": "guessed",
        "assumptions": INWORLD_TTS_ASSUMPTIONS + ["Size unpublished: the range of TTS-1 and TTS-1-Max (1.6–8.8B) is assumed."],
        "sources": INWORLD_TTS_SOURCES,
    },
    "inworld|soniox/stt-rt-v4": {
        "custom": {"parameters": RangeValue(min=0.6, max=2.0), "datacenter": "huggingface_hub"},
        "usageMeasure": "audio_seconds",
        "tokensPerUnit": 50,
        "role": "listening",
        "basis": "guessed",
        "assumptions": SONIOX_ASSUMPTIONS,
        "sources": [
            "https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2",
            "https://huggingface.co/openai/whisper-large-v3",
            "https://soniox.com/docs/data-residency",
        ],
    },
    "inworld|inworld/inworld-stt-1": {
        "custom": {"parameters": RangeValue(min=0.6, max=2.0), "datacenter": "google_genai"},
        "usageMeasure": "audio_seconds",
        "tokensPerUnit": 50,
        "role": "listening",
        "basis": "guessed",
        "assumptions": [
            "Inworld publishes no size or architecture for STT-1: assumed in the range of open speech-recognition models, like Soniox (0.6–2B).",
            "Modelled as 50 tokens per audio second (Whisper's encoder frame rate), with generation capped at real time since recognition is streamed.",
            INWORLD_HOSTING,
        ],
        "sources": [
            "https://docs.inworld.ai/stt/overview",
            "https://docs.inworld.ai/portal/regions",
            "https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2",
            "https://huggingface.co/openai/whisper-large-v3",
        ],
    },
    "elevenlabs|eleven_flash_v2_5": {
        "custom": {"parameters": RangeValue(min=1.6, max=8.8), "datacenter": "google_genai", "zone": "NLD"},
        "usageMeasure": "audio_seconds",
        "tokensPerUnit": 50,
        "role": "speaking",
        "basis": "guessed",
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
        overridden = "parameters" in spec
        if overridden:
            total, active = spec["parameters"]["total"], spec["parameters"]["active"]
        deployment = model.deployment
        return {
            "datacenter": provider,
            "zones": tuple(spec.get("zones", (PROVIDER_CONFIG_MAP[provider].datacenter_location,))),
            "active": ends(active),
            "total": ends(total),
            "bits": tuple(spec.get("quantizationBits", (16, 16))),
            "tps": deployment.tps if deployment else None,
            "ttft": deployment.ttft if deployment else None,
            "warnings": [str(w) for w in model.warnings],
            # EcoLogits' sources describe its own architecture entry, which an override replaces.
            "sources": [] if overridden else list(model.sources),
        }
    custom = spec["custom"]
    return {
        "datacenter": custom["datacenter"],
        "zones": (custom.get("zone", PROVIDER_CONFIG_MAP[custom["datacenter"]].datacenter_location),),
        "active": ends(custom["parameters"]),
        "total": ends(custom["parameters"]),
        "bits": tuple(spec.get("quantizationBits", (16, 16))),
        "tps": None,
        "ttft": None,
        "warnings": [],
        "sources": [],
    }


def dag(inputs, end, tokens, request_seconds, zone):
    config = PROVIDER_CONFIG_MAP[inputs["datacenter"]]
    mix = electricity_mixes.find_electricity_mix(zone=zone)
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
        model_quantization_bits=inputs["bits"][end],
        tps=inputs["tps"],
        ttft=inputs["ttft"],
    )


def embodied_value(result, impact):
    embodied = IMPACTS[impact][1]
    return result[embodied] if embodied else 0


def impact_value(result, impact):
    usage, embodied, _ = IMPACTS[impact]
    return result[usage] + (result[embodied] if embodied else 0)


def coefficients(inputs, end):
    """
    The model's constants at one end of its range. With more than one possible zone, each impact
    takes the zone that gives that end: the lowest at the low end, the highest at the high end —
    per impact, since a cleaner grid can still use more water.
    """
    by_zone = [zone_coefficients(inputs, end, zone) for zone in inputs["zones"]]
    pick = min if end == 0 else max
    combined = dict(by_zone[0])
    for part in ("perToken", "perGenerationSecond", "embodiedPerGenerationSecond"):
        combined[part] = {
            i: pick(by_zone, key=lambda c: (c["perToken"][i], c["perGenerationSecond"][i]))[part][i] for i in IMPACTS
        }
    return combined


def zone_coefficients(inputs, end, zone):
    # Latency 0: generation time is 0, only the per-token part remains.
    per_token_run = dag(inputs, end, 1, 0.0, zone)
    # A huge token count keeps the measured latency binding, so two latencies isolate the per-second part.
    tokens, short, long = 1e9, 10.0, 1000.0
    short_run, long_run = dag(inputs, end, tokens, short, zone), dag(inputs, end, tokens, long, zone)
    unbounded_one, unbounded_zero = dag(inputs, end, 1, math.inf, zone), dag(inputs, end, 0, math.inf, zone)
    return {
        "secondsPerToken": unbounded_one["generation_latency"] - unbounded_zero["generation_latency"],
        "firstTokenSeconds": unbounded_zero["generation_latency"],
        "perToken": {i: impact_value(per_token_run, i) for i in IMPACTS},
        "perGenerationSecond": {
            i: (impact_value(long_run, i) - impact_value(short_run, i)) / (long - short) for i in IMPACTS
        },
        # The part of perGenerationSecond that is hardware manufacturing (EcoLogits' embodied impacts).
        "embodiedPerGenerationSecond": {
            i: (embodied_value(long_run, i) - embodied_value(short_run, i)) / (long - short) for i in IMPACTS
        },
        # GPUs the model needs, all busy while a batch of BATCH_SIZE requests is generated.
        "gpus": per_token_run["gpu_required_count"],
    }


def golden(key, spec, inputs, units, request_seconds):
    tokens = units * spec.get("tokensPerUnit", 1)
    latency = math.inf if request_seconds is None else request_seconds
    # EcoLogits' public entry point, unless our inputs differ from its own: a corrected size, or
    # a quantization range (llm_impacts assumes 16-bit).
    if "ecologits" in spec and "parameters" not in spec and inputs["bits"] == (16, 16) and "zones" not in spec:
        provider, name = spec["ecologits"]
        result = llm_impacts(provider, name, tokens, latency)
        if result.has_errors:
            raise SystemExit(f"{key}: {result.errors}")
    else:
        config = PROVIDER_CONFIG_MAP[inputs["datacenter"]]

        def value(pair):
            low, high = pair
            return RangeValue(min=low, max=high) if low != high else low

        def run(bits, zone):
            mix = electricity_mixes.find_electricity_mix(zone=zone)
            return compute_llm_impacts(
                model_active_parameter_count=value(inputs["active"]),
                model_total_parameter_count=value(inputs["total"]),
                tps=inputs["tps"],
                ttft=inputs["ttft"],
                output_token_count=tokens,
                request_latency=latency,
                if_electricity_mix_adpe=mix.adpe,
                if_electricity_mix_pe=mix.pe,
                if_electricity_mix_gwp=mix.gwp,
                if_electricity_mix_wue=mix.wue,
                datacenter_pue=config.datacenter_pue,
                datacenter_wue=config.datacenter_wue,
                model_quantization_bits=bits,
            )

        # compute_llm_impacts ranges over parameters only; a quantization range is the low end
        # of an 8-bit run and the high end of a 16-bit one, and a zone range the lowest and
        # highest of each impact over the zones.
        low_bits, high_bits = inputs["bits"]
        low_runs = [run(low_bits, zone) for zone in inputs["zones"]]
        high_runs = [run(high_bits, zone) for zone in inputs["zones"]]
        return {
            "units": units,
            "requestSeconds": request_seconds,
            "impacts": {
                i: [min(field(r, i)[0] for r in low_runs), max(field(r, i)[1] for r in high_runs)] for i in IMPACTS
            },
            "manufacturing": {
                i: [min(field(r.embodied, i)[0] for r in low_runs), max(field(r.embodied, i)[1] for r in high_runs)]
                for i in IMPACTS
            },
        }
    return {
        "units": units,
        "requestSeconds": request_seconds,
        "impacts": {i: list(field(result, i)) for i in IMPACTS},
        "manufacturing": {i: list(field(result.embodied, i)) for i in IMPACTS},
    }


def field(impacts, impact):
    """(low, high) of one criterion in an EcoLogits result; (0, 0) where it reports none (embodied energy, water)."""
    value = getattr(impacts, IMPACTS[impact][2], None)
    return ends(value.value) if value is not None else (0, 0)


def export(expected_version):
    actual = installed_version("ecologits")
    if expected_version and actual != expected_version:
        raise SystemExit(f"Expected EcoLogits {expected_version}, but {actual} is installed")

    out = {
        "generatedBy": "scripts/ecologits/export.py — do not edit by hand; run `npm run footprint:update` in server/",
        "ecologitsVersion": actual,
        "license": "EcoLogits (https://github.com/mlco2/ecologits) is MPL-2.0",
        "units": UNITS,
        # EcoLogits' fixed hardware assumptions, behind the meter's GPU-time figure.
        "hardware": {
            "gpu": f"NVIDIA H100 ({GPU_MEMORY} GB)",
            "batchSize": BATCH_SIZE,
            "lifetimeSeconds": HARDWARE_LIFESPAN,
        },
        "models": {},
    }
    for key, spec in MODELS.items():
        if spec.get("role") not in ROLES or spec.get("basis") not in BASES:
            raise SystemExit(f"{key}: needs a role {ROLES} and a basis {BASES}")
        inputs = resolve(key, spec)
        for zone in inputs["zones"]:
            if electricity_mixes.find_electricity_mix(zone=zone) is None:
                raise SystemExit(f"{key}: EcoLogits has no electricity mix for {zone}")
        out["models"][key] = {
            "ecologitsModel": "/".join(spec["ecologits"]) if "ecologits" in spec else None,
            "role": spec["role"],
            "basis": spec["basis"],
            "usageMeasure": spec.get("usageMeasure", "output_tokens"),
            "tokensPerUnit": spec.get("tokensPerUnit", 1),
            "datacenterZones": list(inputs["zones"]),
            "activeParameters": list(inputs["active"]),
            "totalParameters": list(inputs["total"]),
            "quantizationBits": list(inputs["bits"]),
            "low": coefficients(inputs, 0),
            "high": coefficients(inputs, 1),
            "assumptions": spec.get("assumptions", []),
            "warnings": inputs["warnings"],
            "sources": list(dict.fromkeys(inputs["sources"] + spec.get("sources", []))),
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
