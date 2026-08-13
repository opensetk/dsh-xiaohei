/**
 * 宠物素材：全部内联进 client bundle（data URL），
 * 由 esbuild 的 --loader:.gif=dataurl / --loader:.png=dataurl 处理。
 * 素材来源：dshpet/pet/（含 manifest.json 说明每张图的尺寸与标签）。
 */
import base from '../../assets/main-base.png'
import bored from '../../assets/main-bored.png'
import daze from '../../assets/main-daze.png'
import celebrate from '../../assets/main-celebrate.gif'
import wave from '../../assets/main-wave.gif'
import run from '../../assets/main-run.gif'
import wiggle from '../../assets/main-wiggle.gif'
import roll from '../../assets/main-roll.gif'
import eat from '../../assets/main-eat.gif'
import sneakEat from '../../assets/main-sneak-eat.gif'
import playHeixiu from '../../assets/main-play-heixiu.gif'
import heixiu from '../../assets/heixiu.gif'
import heixiuDisplay from '../../assets/heixiu-display.png'

export const ASSETS = {
  base,
  bored,
  daze,
  celebrate,
  wave,
  run,
  wiggle,
  roll,
  eat,
  sneakEat,
  playHeixiu,
  heixiu,
  heixiuDisplay,
} as const

export type AssetKey = keyof typeof ASSETS
