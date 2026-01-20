import { detectRuntime } from 'noba'

const runtime = detectRuntime()

// @ts-ignore
if (runtime === 'bare') await import('bare-node-runtime/global')

export const shims: ImportAttributes =
  runtime === 'bare' ? { imports: 'bare-node-runtime/imports' } : {}
