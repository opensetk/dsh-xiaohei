#!/usr/bin/env node
/**
 * dsh-pet 构建脚本。
 *
 * 用法：node scripts/build.mjs   （或 `npm run build`）
 *
 * 背景：`@deepseek-ai/*` 的 dsh-client-* 运行时包只随 DSH 安装一起交付，
 * 没有完整的独立 npm 发布链，因此这里直接复用本机 DSH 安装里的包作为
 * 解析源（与 `pkgManager`/浏览器模块宿主保持同一版本）。
 */
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { mkdirSync, rmSync, symlinkSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')

/** 尝试从若干候选位置定位 DSH 安装里的 @deepseek-ai 模块源。 */
function findDshModules() {
  const req = createRequire(import.meta.url)
  // 1) 通过可解析的 @deepseek-ai/dsh 反查（全局 dsh CLI）
  const byDsh = (() => {
    try {
      const root = path.dirname(req.resolve('@deepseek-ai/dsh/package.json'))
      const cand = path.join(root, 'node_modules')
      return existsSync(path.join(cand, '@deepseek-ai', 'dsh-client-runtime')) ? cand : null
    } catch { return null }
  })()
  if (byDsh) return byDsh
  // 2) 常见全局安装目录里直接定位 dsh
  for (const base of ['/opt/homebrew/lib', '/usr/local/lib', '/usr/lib']) {
    const cand = path.join(base, 'node_modules', '@deepseek-ai', 'dsh', 'node_modules')
    if (existsSync(path.join(cand, '@deepseek-ai', 'dsh-client-runtime'))) return cand
  }
  // 3) 当前项目/node_modules 下的 dsh（源码检出内联场景）
  for (const rel of ['node_modules/@deepseek-ai/dsh/node_modules', '../node_modules/@deepseek-ai/dsh/node_modules']) {
    const cand = path.resolve(root, rel)
    if (existsSync(path.join(cand, '@deepseek-ai', 'dsh-client-runtime'))) return cand
  }
  return null
}

const dsh = findDshModules()
if (!dsh) {
  console.error('# 未找到 DSH 安装（需含 @deepseek-ai/dsh-client-runtime）。')
  console.error('# 请先安装 dsh，或在本机的 DSH 源码检出的 packages/ 下放置本插件后构建。')
  process.exit(1)
}
console.log('# 使用 DSH 模块源:', dsh)

// 让浏览器 bundle 能解析 @deepseek-ai/* 与 react
const nm = path.join(root, 'node_modules')
const ai = path.join(nm, '@deepseek-ai')
mkdirSync(ai, { recursive: true })
// 注意：宿主 bundle（lib/index.js）对这些包保持 external，运行时由 Node 从
// dsh-pet/node_modules 向上解析 —— 这里必须为**所有被宿主源码 import 的
// @deepseek-ai 包**建链接，否则加载宿主插件会报
// "Cannot find package '@deepseek-ai/xxx' imported from .../dsh-pet/lib/index.js"。
for (const pkg of ['dsh-client-runtime', 'dsh-client-ui-slots', 'cordis', 'dsh-typert-protocol', 'dsh-typert-registry']) {
  const target = path.join(dsh, '@deepseek-ai', pkg)
  const link = path.join(ai, pkg)
  if (!existsSync(link)) symlinkSync(target, link, 'junction')
}
for (const pkg of ['react', 'react-dom', 'scheduler']) {
  const src = path.join(dsh, pkg)
  const link = path.join(nm, pkg)
  if (existsSync(src) && !existsSync(link)) symlinkSync(src, link, 'junction')
}
// typert.host.js（./typert 导出）external 了 zod，运行时同样需要可解析。
for (const pkg of ['zod']) {
  const src = path.join(dsh, pkg)
  const link = path.join(nm, pkg)
  if (existsSync(src) && !existsSync(link)) symlinkSync(src, link, 'junction')
}

mkdirSync(path.join(root, 'lib'), { recursive: true })
const run = (label, cmd) => {
  console.log(`\n# ${label}`)
  execSync(`cd ${root} && ${cmd}`, { stdio: 'inherit' })
}

run('构建宿主插件 → lib/index.js',
  `npx --yes esbuild@0.22 src/index.ts --bundle --platform=node --format=esm --target=node20 --external:@deepseek-ai/* --outfile=lib/index.js`)
run('构建 TYPERT host manifest → lib/typert.host.js',
  `npx --yes esbuild@0.22 src/typert.host.ts --bundle --platform=node --format=esm --target=node20 --external:zod --external:@deepseek-ai/* --outfile=lib/typert.host.js`)
// 浏览器插件必须以官方 client bundle 格式输出：经典 script 加载后立即调用
// `window.__ModuleLoader__.load({ id, factory })` 注册自身（见 dsh-client-modules
// 的 arrive()/materialize()）；factory 是 CJS 形态，依赖经 loader 的 require
// 解析（平台 seed：react / react/jsx-runtime 等）。因此这里用 --format=cjs 并把
// 输出包进 load 调用 —— 普通 ESM bundle 不会被识别，浏览器会报
// "loaded without registering <id> via __ModuleLoader__.load"。
run('构建浏览器插件 → lib/client.js',
  `npx --yes esbuild@0.22 src/client/index.ts --bundle --platform=browser --format=cjs --target=es2020 --jsx=automatic --loader:.gif=dataurl --loader:.png=dataurl --loader:.webp=dataurl --external:@deepseek-ai/* --external:react --external:react/jsx-runtime --banner:js='window.__ModuleLoader__.load({id:"dsh-pet",factory:(require)=>{var module={exports:{}};var exports=module.exports;Object.defineProperty(exports,Symbol.toStringTag,{value:"Module"});' --footer:js='return module.exports;}});' --outfile=lib/client.js`)

console.log('\n# 完成。产物：lib/index.js（宿主）、lib/client.js（浏览器）。')
