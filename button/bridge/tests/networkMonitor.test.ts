import { describe, expect, it } from "vitest";
import type { NetworkSampleBatch } from "../../../shared/networkSamples.js";
import {
  NetworkMonitor,
  parseDefaultRoute,
  parseInterfaceErrors,
  parseLink,
  parsePing,
  type CommandRunner,
} from "../src/networkMonitor.js";
import { ServerError, type ServerClient } from "../src/serverClient.js";

const MAC_PING = `PING 1.1.1.1 (1.1.1.1): 56 data bytes

--- 1.1.1.1 ping statistics ---
5 packets transmitted, 4 packets received, 20.0% packet loss
round-trip min/avg/max/stddev = 25.425/47.386/90.428/30.437 ms
`;
const MAC_PING_DOWN = `PING 1.1.1.1 (1.1.1.1): 56 data bytes

--- 1.1.1.1 ping statistics ---
5 packets transmitted, 0 packets received, 100.0% packet loss
`;
const LINUX_PING = `--- 1.1.1.1 ping statistics ---
5 packets transmitted, 5 received, 0% packet loss, time 803ms
rtt min/avg/max/mdev = 11.204/12.533/14.871/1.270 ms
`;

describe("reading macOS command output", () => {
  it.each([
    ["macOS, some loss", MAC_PING, { sent: 5, received: 4, avgMs: 47.4, maxMs: 90.4, jitterMs: 30.4 }],
    ["macOS, nothing back", MAC_PING_DOWN, { sent: 5, received: 0, avgMs: null, maxMs: null, jitterMs: null }],
    ["Linux", LINUX_PING, { sent: 5, received: 5, avgMs: 12.5, maxMs: 14.9, jitterMs: 1.3 }],
    ["no output (ping not runnable)", "", { sent: 5, received: 0, avgMs: null, maxMs: null, jitterMs: null }],
  ])("ping summary: %s", (_name, text, expected) => {
    expect(parsePing(text, 5)).toEqual(expected);
  });

  it("finds the router and its interface", () => {
    const text = "   route to: default\ndestination: default\n    gateway: 10.1.1.1\n  interface: en0\n";
    expect(parseDefaultRoute(text)).toEqual({ gateway: "10.1.1.1", iface: "en0" });
    expect(parseDefaultRoute("route: writing to routing socket: not in table")).toEqual({ gateway: null, iface: null });
  });

  it.each([
    ["with a hardware address", "en0  1500  <Link#11>   f2:4d:78:92:2b:5b 11762533     7  9909479     2     0"],
    ["without one", "en0  1500  <Link#11>   11762533     7  9909479     2     0"],
  ])("interface error counters, %s", (_name, row) => {
    const text = `Name  Mtu   Network  Address  Ipkts Ierrs  Opkts Oerrs  Coll\n${row}\nen0  1500  fe80::1  fe80:b::2f 11762533  -  9909479  -  -\n`;
    expect(parseInterfaceErrors(text)).toEqual({ inErrors: 7, outErrors: 2 });
  });

  it.each([
    ["\tmedia: autoselect (1000baseT <full-duplex,flow-control>)\n\tstatus: active\n", "autoselect (1000baseT <full-duplex,flow-control>)"],
    ["\tmedia: autoselect (none)\n\tstatus: inactive\n", "inactive"],
  ])("link from ifconfig", (text, expected) => {
    expect(parseLink(text)).toBe(expected);
  });
});

type Net = { internetUp: boolean; inErrors: number };

/** Answers the commands the monitor runs, from a network the test can change. */
function fakeCommands(net: Net): CommandRunner {
  return async (command, args) => {
    if (command === "route") return "    gateway: 10.1.1.1\n  interface: en0\n";
    if (command === "netstat") return `en0  1500  <Link#11>  aa:bb:cc:dd:ee:ff  100  ${net.inErrors}  100  0  0\n`;
    if (command === "ifconfig") return "\tmedia: autoselect (1000baseT <full-duplex>)\n\tstatus: active\n";
    if (command === "ping") return args.at(-1) === "10.1.1.1" || net.internetUp ? MAC_PING : MAC_PING_DOWN;
    throw new Error(`unexpected command ${command}`);
  };
}

/** Stands in for the council server: reachable exactly when the test's internet is up. */
function fakeServer(net: Net, refuse?: number) {
  const received: NetworkSampleBatch[] = [];
  const server = {
    async getVenues() {
      if (!net.internetUp) throw new ServerError("council server unreachable", null);
      return [];
    },
    async sendNetworkSamples(batch: NetworkSampleBatch) {
      if (!net.internetUp) throw new ServerError("council server unreachable", null);
      if (refuse) throw new ServerError(`council server answered ${refuse}`, refuse);
      received.push(batch);
    },
  } as unknown as ServerClient;
  return { server, received };
}

function monitor(net: Net, server: ServerClient | null) {
  return new NetworkMonitor({
    target: () => (server ? { server, venueId: "example-museum" } : null),
    host: "council-museum.local",
    sampleMs: 60_000,
    internetHost: "1.1.1.1",
    run: fakeCommands(net),
  });
}

describe("NetworkMonitor", () => {
  it("sends each minute's sample to the chosen venue", async () => {
    const net = { internetUp: true, inErrors: 3 };
    const { server, received } = fakeServer(net);
    const network = monitor(net, server);

    await network.tick();
    net.inErrors = 8;
    await network.tick();

    expect(received.map((batch) => batch.venueId)).toEqual(["example-museum", "example-museum"]);
    const [first, second] = received.map((batch) => batch.samples[0]);
    expect(first).toMatchObject({ iface: "en0", link: "autoselect (1000baseT <full-duplex>)", inErrors: null });
    expect(first.gateway?.received).toBe(4);
    expect(first.serverMs).toEqual(expect.any(Number));
    // Errors are counted since the sample before, not since the Mac started.
    expect(second).toMatchObject({ inErrors: 5, outErrors: 0 });
  });

  it("keeps samples while offline and sends them in order once the server answers", async () => {
    const net = { internetUp: false, inErrors: 0 };
    const { server, received } = fakeServer(net);
    const network = monitor(net, server);

    await network.tick();
    await network.tick();
    await network.tick();
    expect(received).toEqual([]);
    expect(network.pendingCount()).toBe(3);

    net.internetUp = true;
    await network.tick();

    const samples = received.flatMap((batch) => batch.samples);
    expect(samples.map((sample) => sample.serverMs === null)).toEqual([true, true, true, false]);
    expect(samples[0].internet.received).toBe(0);
    expect(samples[0].gateway?.received).toBe(4);
    expect(network.pendingCount()).toBe(0);
  });

  it("drops samples the server refuses instead of retrying them forever", async () => {
    const net = { internetUp: true, inErrors: 0 };
    const { server } = fakeServer(net, 400);
    const network = monitor(net, server);

    await network.tick();

    expect(network.pendingCount()).toBe(0);
  });

  it("measures nothing until staff have entered the key and chosen a venue", async () => {
    const net = { internetUp: true, inErrors: 0 };
    const network = monitor(net, null);

    await network.tick();

    expect(network.pendingCount()).toBe(0);
  });
});
