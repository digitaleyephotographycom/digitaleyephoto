import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import http from "http";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const artifactDir = path.resolve(process.env.USERPROFILE || "C:\\Users\\acer", ".gemini", "antigravity-ide", "brain", "8ac65951-07fd-472f-9b17-470d49f537b0");

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getWsUrl(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json`, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const list = JSON.parse(data);
          const page = list.find((t) => t.type === "page");
          if (page) resolve(page.webSocketDebuggerUrl);
          else resolve(null);
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    const { WebSocket } = await import("ws").catch(async () => {
      // In case ws package is not installed, we can fall back
      return { WebSocket: globalThis.WebSocket };
    });
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

async function run() {
  const port = 9333;
  const chrome = spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
  ]);

  try {
    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      try {
        wsUrl = await getWsUrl(port);
        if (wsUrl) break;
      } catch {}
      await sleep(300);
    }

    if (!wsUrl) throw new Error("Could not connect to Chrome CDP");

    const cdp = new CDP(wsUrl);
    await cdp.connect();

    await cdp.send("Page.enable");
    await cdp.send("Network.enable");
    await cdp.send("Runtime.enable");

    // 1. Set cookie
    await cdp.send("Network.setCookie", {
      name: "admin_session",
      value: "eyJlbWFpbCI6ImRpZ2l0YWxAY29tIiwiaXNzdWVkQXQiOjE3ODg4ODUzNDA5MTAsImV4cGlyZXNBdCI6MTc4ODk3MTc0MDkxMH0.e8af2a776c3c85ab7ba576a6d0ba9f4d3099284fb880d27a7ded88f58bca8054",
      domain: "localhost",
      path: "/",
    });

    // 2. Mobile Viewport Test (375x812)
    console.log("\n--- Measuring Mobile Storage Pipe (375px width) ---");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true,
    });

    await cdp.send("Page.navigate", { url: "http://localhost:3003/studio" });
    await sleep(2500);

    // Evaluate bounding boxes of scale-9 and scale-10
    const evalRes = await cdp.send("Runtime.evaluate", {
      expression: `
        (() => {
          const s9 = document.querySelector('.pipe-scale-labels .scale-9');
          const s10 = document.querySelector('.pipe-scale-labels .scale-10');
          if (!s9 || !s10) return { error: "Elements not found" };
          const r9 = s9.getBoundingClientRect();
          const r10 = s10.getBoundingClientRect();
          return {
            scale9: { text: s9.textContent, left: r9.left, right: r9.right, width: r9.width },
            scale10: { text: s10.textContent, left: r10.left, right: r10.right, width: r10.width },
            gap: r10.left - r9.right,
            overlaps: r9.right > r10.left
          };
        })()
      `,
      returnByValue: true,
    });

    console.log("Mobile bounding rect analysis:", JSON.stringify(evalRes.result?.value, null, 2));

    const shot1 = await cdp.send("Page.captureScreenshot", { format: "png" });
    const mobileShotPath = path.join(artifactDir, "mobile_studio_view.png");
    fs.writeFileSync(mobileShotPath, Buffer.from(shot1.data, "base64"));
    console.log("Saved mobile screenshot to:", mobileShotPath);

    // 3. Desktop Admin Selected View
    console.log("\n--- Desktop Admin Selected Photos & Copy Image Names Button ---");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    await cdp.send("Page.navigate", { url: "http://localhost:3003/studio/g1307eaaa8826" });
    await sleep(6000); // Allow dev mode route compilation

    // Click "Selected" tab
    await cdp.send("Runtime.evaluate", {
      expression: `
        (() => {
          const tabs = Array.from(document.querySelectorAll('.tab'));
          const selTab = tabs.find(t => t.textContent.includes('Selected'));
          if (selTab) selTab.click();
        })()
      `,
    });
    await sleep(800);

    const shot2 = await cdp.send("Page.captureScreenshot", { format: "png" });
    const desktopShotPath = path.join(artifactDir, "desktop_admin_selected.png");
    fs.writeFileSync(desktopShotPath, Buffer.from(shot2.data, "base64"));
    console.log("Saved desktop screenshot to:", desktopShotPath);

    // 4. Mobile Client List (scroll down to verify Delete button)
    console.log("\n--- Mobile Studio Client List & Delete Button ---");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await cdp.send("Page.navigate", { url: "http://localhost:3003/studio" });
    await sleep(4000);
    // Scroll down to client list
    await cdp.send("Runtime.evaluate", {
      expression: `window.scrollTo({ top: 750, behavior: 'instant' })`,
    });
    await sleep(800);

    const shot3 = await cdp.send("Page.captureScreenshot", { format: "png" });
    const clientListShotPath = path.join(artifactDir, "mobile_client_list.png");
    fs.writeFileSync(clientListShotPath, Buffer.from(shot3.data, "base64"));
    console.log("Saved mobile client list screenshot to:", clientListShotPath);

    cdp.close();
  } finally {
    chrome.kill();
  }
}

run().catch(console.error);
