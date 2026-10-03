import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync(new URL("../../../scripts/ensure-browser-vnc.sh", import.meta.url), "utf8");
assert.match(script, /food-woolworths-browser\.service/, "the watchdog must recover the host Woolworths browser");
assert.match(script, /http:\/\/127\.0\.0\.1:6085\/vnc\.html/, "the watchdog must verify the local Woolworths noVNC endpoint");

const service = readFileSync(new URL("../../../deploy/food-browser-vnc-watchdog.service", import.meta.url), "utf8");
assert.match(service, /ExecStart=\/usr\/bin\/bash \/home\/peter\/Development\/food\/scripts\/ensure-browser-vnc\.sh/, "systemd must run the watchdog through bash even if deployment lost the executable mode");

const socket = readFileSync(new URL("../../../deploy/food-woolworths-novnc.socket", import.meta.url), "utf8");
assert.match(socket, /ListenStream=0\.0\.0\.0:6085/, "Woolworths noVNC must bind after Coffee receives its LAN address");
assert.doesNotMatch(socket, /192\.168\.0\.111/, "the socket must not depend on a boot-time static address");

console.log("Browser VNC watchdog regressions passed.");