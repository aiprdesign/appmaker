import { BlockList, isIP } from "node:net";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";

/**
 * SSRF protection shared by every feature that makes the server connect to a
 * user-supplied address (website import, custom AI endpoints). Addresses are
 * checked when DNS resolves, on every connection, so a public hostname can't
 * be pointed at a private or cloud-metadata address later.
 */

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["64:ff9b::", 96],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  if (family === 6) {
    // IPv4-mapped IPv6 (::ffff:a.b.c.d or ::ffff:7f00:1) is judged as IPv4.
    const dotted = /^(?:0{0,4}:){0,5}:?ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (dotted) return isPublicAddress(dotted[1]);
    const hex = /^(?:0{0,4}:){0,5}:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return isPublicAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return !blocked.check(address, "ipv6");
  }
  return !blocked.check(address, "ipv4");
}

export type Lookup = (
  hostname: string,
  options: { all?: boolean },
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
) => void;

/** A dns.lookup replacement that refuses non-public addresses unless `allowPrivate()` is true. */
export function makeSafeLookup(allowPrivate: () => boolean): Lookup {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { all: true }, (err, addresses) => {
      if (err) return callback(err, "");
      const ok = allowPrivate() ? addresses : addresses.filter((a) => isPublicAddress(a.address));
      if (!ok.length) return callback(Object.assign(new Error("blocked address"), { code: "EBLOCKED" }), "");
      if (options?.all) callback(null, ok);
      else callback(null, ok[0].address, ok[0].family);
    });
  };
}

/** True when a URL's host is literally a private IP or a local-only name. */
export function isPrivateHost(url: URL): boolean {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  return isIP(host) ? !isPublicAddress(host) : /(^|\.)(localhost|local|internal|localdomain)$/i.test(host);
}
