export interface ParsedUA {
  browser: string;
  os: string;
  device: string;
}

/**
 * Extracts OS, Browser, and Device category from a User-Agent string.
 * This is a lightweight utility function requiring no external packages.
 */
export function parseUserAgent(uaString: string | undefined): ParsedUA {
  if (!uaString) {
    return { browser: "Unknown", os: "Unknown", device: "Desktop" };
  }

  const ua = uaString.toLowerCase();
  let browser = "Unknown Browser";
  let os = "Unknown OS";
  let device = "Desktop";

  // Determine device type
  if (/mobile|android|iphone|ipad|phone/i.test(ua)) {
    if (/ipad|tablet/i.test(ua)) {
      device = "Tablet";
    } else {
      device = "Mobile";
    }
  } else {
    device = "Desktop";
  }

  // Determine OS
  if (ua.includes("windows")) {
    os = "Windows";
  } else if (ua.includes("macintosh") || ua.includes("mac os x")) {
    if (ua.includes("ipad") || ua.includes("iphone")) {
      os = "iOS";
    } else {
      os = "macOS";
    }
  } else if (ua.includes("linux")) {
    if (ua.includes("android")) {
      os = "Android";
    } else {
      os = "Linux";
    }
  } else if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) {
    os = "iOS";
  } else if (ua.includes("android")) {
    os = "Android";
  } else if (ua.includes("postman")) {
    os = "Desktop OS";
  }

  // Determine Browser
  if (ua.includes("postman")) {
    browser = "Postman Client";
  } else if (ua.includes("curl")) {
    browser = "curl";
  } else if (ua.includes("insomnia")) {
    browser = "Insomnia Client";
  } else if (ua.includes("thunder client")) {
    browser = "Thunder Client";
  } else if (ua.includes("edg/")) {
    browser = "Edge";
  } else if (ua.includes("chrome") || ua.includes("crios")) {
    // Chrome UA also contains Safari, so check Chrome first
    browser = "Chrome";
  } else if (ua.includes("firefox") || ua.includes("fxios")) {
    browser = "Firefox";
  } else if (ua.includes("safari")) {
    browser = "Safari";
  } else if (ua.includes("opr/") || ua.includes("opera")) {
    browser = "Opera";
  } else if (ua.includes("msie") || ua.includes("trident")) {
    browser = "Internet Explorer";
  }

  return { browser, os, device };
}
