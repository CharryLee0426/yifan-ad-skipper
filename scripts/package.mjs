import { cp, mkdir, mkdtemp, rm, copyFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const staging = await mkdtemp(path.join(tmpdir(), "yifan-package-"));
const output = path.resolve("dist/yifan-ad-skipper.zip");
try {
  const folder = path.join(staging, "yifan-ad-skipper");
  await mkdir(folder);
  await cp("extension", path.join(folder, "extension"), {
    recursive: true,
    filter: source => !["_metadata", ".DS_Store"].includes(path.basename(source))
  });
  await copyFile("README.md", path.join(folder, "README.md"));
  await copyFile("README.zh-CN.md", path.join(folder, "README.zh-CN.md"));
  await copyFile("RESEARCH.md", path.join(folder, "RESEARCH.md"));
  await copyFile("LICENSE", path.join(folder, "LICENSE"));
  await cp("docs", path.join(folder, "docs"), { recursive: true });
  await mkdir("dist", { recursive: true });
  await rm(output, { force: true });
  const result = spawnSync("zip", ["-q", "-r", output, "yifan-ad-skipper"], { cwd: staging, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`zip exited with code ${result.status}`);
  console.log(output);
} finally { await rm(staging, { recursive: true, force: true }); }
