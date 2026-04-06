import fs from 'fs/promises'
import path from 'path'

const uploadDir = path.join(process.cwd(), 'public/uploads')

export async function uploadOSS(buffer: Buffer, filename: string) {
  await fs.mkdir(uploadDir, { recursive: true })

  const safeName = filename.replace(/\s+/g, '')
  const name = `${Date.now()}-${safeName}`
  const destination = path.join(uploadDir, name)

  await fs.writeFile(destination, buffer)

  return `/uploads/${name}`
}
