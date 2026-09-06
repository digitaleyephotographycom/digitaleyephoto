import crypto from "crypto";

export function newId(prefix = "") {
  return prefix + crypto.randomBytes(6).toString("hex");
}

export function genCode(name) {
  const initials =
    (name || "GAL")
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 3)
      .toUpperCase() || "GAL";
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${initials}-${num}`;
}
