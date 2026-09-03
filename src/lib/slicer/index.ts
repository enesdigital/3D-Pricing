import type { SlicerData } from './types.ts'
import { parseGcodeText, readHeadTail, gramsFromLength } from './parseGcode.ts'
import { parseGcode3mf } from './parse3mf.ts'

export * from './types.ts'
export { gramsFromLength }

/** Dosya türüne göre dilimleyici verisini okur. */
export async function parseSlicerFile(file: File): Promise<SlicerData> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.3mf')) {
    const buf = await file.arrayBuffer()
    return parseGcode3mf(buf, file.name)
  }
  if (name.endsWith('.bgcode')) {
    throw new Error('BGCODE')
  }
  const text = await readHeadTail(file)
  return parseGcodeText(text, file.name)
}
