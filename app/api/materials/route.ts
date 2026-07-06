import { NextResponse } from 'next/server'
import { readFile, writeFile, mkdir, stat, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { getAuthUser } from '@/lib/auth'

const DATA_DIR = path.join(process.cwd(), 'data', 'materials')
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'materials')
const MAX_SIZE = 10 * 1024 * 1024

interface StoredMaterial {
  id: string
  title: string
  type: string
  category: string
  url: string
  thumbnail?: string
  filename: string
  size: number
  mimeType: string
  createdAt: string
}

interface MaterialStore {
  categories: { id: string; label: string }[]
  materials: StoredMaterial[]
}

const DEFAULT_CATEGORIES = [
  { id: 'ai-image', label: 'AI图片' },
  { id: 'ai-video', label: 'AI视频' },
  { id: 'character', label: '人物' },
  { id: 'scene', label: '场景' },
  { id: 'object', label: '物品' },
  { id: 'style', label: '风格' },
  { id: 'audio', label: '音效' },
  { id: 'other', label: '其他' },
]

async function userDataFile(userId: string): Promise<string> {
  await mkdir(DATA_DIR, { recursive: true })
  return path.join(DATA_DIR, `${userId}.json`)
}

async function loadStore(userId: string): Promise<MaterialStore> {
  try {
    const file = await userDataFile(userId)
    if (!existsSync(file)) return { categories: [...DEFAULT_CATEGORIES], materials: [] }
    const raw = await readFile(file, 'utf-8')
    const store: MaterialStore = JSON.parse(raw)
    // Ensure all default categories exist
    const existingIds = new Set(store.categories.map((c) => c.id))
    for (const def of DEFAULT_CATEGORIES) {
      if (!existingIds.has(def.id)) store.categories.unshift(def)
    }
    return store
  } catch {
    return { categories: [...DEFAULT_CATEGORIES], materials: [] }
  }
}

async function saveStore(userId: string, store: MaterialStore) {
  const file = await userDataFile(userId)
  await writeFile(file, JSON.stringify(store, null, 2))
}

export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const store = await loadStore(user.id)
  return NextResponse.json(store)
}

export async function POST(request: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  try {
    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      const body = await request.json() as {
        action: string
        id?: string
        label?: string
        url?: string
        title?: string
        type?: string
        category?: string
        thumbnail?: string
      }
      const store = await loadStore(user.id)

      if (body.action === 'add-category') {
        const { id, label } = body
        if (!id || !label) return NextResponse.json({ error: '缺少分类信息' }, { status: 400 })
        if (store.categories.some((c) => c.id === id)) {
          return NextResponse.json({ error: '分类已存在' }, { status: 409 })
        }
        store.categories.push({ id, label })
        await saveStore(user.id, store)
        return NextResponse.json({ categories: store.categories })
      }

      if (body.action === 'register-local') {
        const { url, title, type, category, thumbnail } = body
        if (!url || !type) return NextResponse.json({ error: '缺少 url / type' }, { status: 400 })

        const matId = randomUUID()
        const filename = url.split('/').pop() || matId
        let fileSize = 0
        try {
          const filePath = path.join(process.cwd(), 'public', url)
          const s = await stat(filePath)
          fileSize = s.size
        } catch { /* file may not exist yet */ }

        const ext = path.extname(filename).toLowerCase()
        const mimeType = ext === '.png' ? 'image/png'
          : ext === '.webp' ? 'image/webp'
          : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
          : ext === '.mp4' ? 'video/mp4'
          : ext === '.webm' ? 'video/webm'
          : ext === '.mp3' ? 'audio/mp3'
          : type === 'image' ? 'image/png'
          : type === 'video' ? 'video/mp4'
          : 'application/octet-stream'

        let thumbnailUrl: string | undefined
        if (thumbnail?.startsWith('data:')) {
          const thumbData = thumbnail.split(',')[1]
          if (thumbData) {
            await mkdir(UPLOAD_DIR, { recursive: true })
            const thumbName = `${matId}-thumb.jpg`
            await writeFile(path.join(UPLOAD_DIR, thumbName), Buffer.from(thumbData, 'base64'))
            thumbnailUrl = `/uploads/materials/${thumbName}`
          }
        }
        if (!thumbnailUrl && type === 'image') thumbnailUrl = url

        const cat = category || (type === 'image' ? 'ai-image' : type === 'video' ? 'ai-video' : 'other')
        if (!store.categories.some((c) => c.id === cat)) {
          const catLabel = cat === 'ai-image' ? 'AI图片' : cat === 'ai-video' ? 'AI视频' : cat
          store.categories.push({ id: cat, label: catLabel })
        }

        const material: StoredMaterial = {
          id: matId,
          title: title || `AI ${type} ${new Date().toLocaleTimeString()}`,
          type,
          category: cat,
          url,
          thumbnail: thumbnailUrl,
          filename,
          size: fileSize,
          mimeType,
          createdAt: new Date().toISOString(),
        }
        store.materials.unshift(material)
        await saveStore(user.id, store)
        return NextResponse.json(material)
      }

      if (body.action === 'save-from-url') {
        const { url, title, type, category, thumbnail } = body
        if (!url || !type) return NextResponse.json({ error: '缺少 url / type' }, { status: 400 })

        await mkdir(UPLOAD_DIR, { recursive: true })
        const matId = randomUUID()

        let resp: Response | undefined
        for (let attempt = 0; attempt <= 3; attempt++) {
          try {
            resp = await fetch(url, { signal: AbortSignal.timeout(30_000) })
            if (resp.ok) break
          } catch (e: unknown) {
            const err = e instanceof Error ? e : undefined
            const msg = [err?.message, (err?.cause as Error | undefined)?.message].join(' ')
            const retryable = /timeout|ECONNRESET|ECONNREFUSED|ENOTFOUND|UND_ERR|fetch failed/i.test(msg)
            if (!retryable || attempt === 3) throw e
            await new Promise((r) => setTimeout(r, (attempt + 1) * 3000))
          }
        }
        if (!resp?.ok) return NextResponse.json({ error: '下载文件失败' }, { status: 502 })

        const ct = resp.headers.get('content-type') || ''
        const ext = ct.includes('png') ? '.png'
          : ct.includes('webp') ? '.webp'
          : ct.includes('mp4') ? '.mp4'
          : ct.includes('webm') ? '.webm'
          : type === 'image' ? '.png' : '.mp4'

        const diskName = `${matId}${ext}`
        const buffer = Buffer.from(await resp.arrayBuffer())
        await writeFile(path.join(UPLOAD_DIR, diskName), buffer)
        const savedUrl = `/uploads/materials/${diskName}`

        let thumbnailUrl: string | undefined
        if (thumbnail?.startsWith('data:')) {
          const thumbData = thumbnail.split(',')[1]
          if (thumbData) {
            const thumbName = `${matId}-thumb.jpg`
            await writeFile(path.join(UPLOAD_DIR, thumbName), Buffer.from(thumbData, 'base64'))
            thumbnailUrl = `/uploads/materials/${thumbName}`
          }
        }
        if (!thumbnailUrl && type === 'image') thumbnailUrl = savedUrl

        const cat = category || (type === 'image' ? 'ai-image' : type === 'video' ? 'ai-video' : 'other')
        if (!store.categories.some((c) => c.id === cat)) {
          const catLabel = cat === 'ai-image' ? 'AI图片' : cat === 'ai-video' ? 'AI视频' : cat
          store.categories.push({ id: cat, label: catLabel })
        }

        const material: StoredMaterial = {
          id: matId,
          title: title || `AI ${type} ${new Date().toLocaleTimeString()}`,
          type,
          category: cat,
          url: savedUrl,
          thumbnail: thumbnailUrl,
          filename: diskName,
          size: buffer.length,
          mimeType: ct || (type === 'image' ? 'image/png' : 'video/mp4'),
          createdAt: new Date().toISOString(),
        }
        store.materials.unshift(material)
        await saveStore(user.id, store)
        return NextResponse.json(material)
      }

      if (body.action === 'delete-category') {
        const { id } = body
        store.categories = store.categories.filter((c) => c.id !== id)
        store.materials.forEach((m) => { if (m.category === id) m.category = 'other' })
        await saveStore(user.id, store)
        return NextResponse.json({ categories: store.categories })
      }

      return NextResponse.json({ error: '未知操作' }, { status: 400 })
    }

    // ── multipart/form-data 文件上传 ──
    const formData = await request.formData()
    const file = formData.get('file')
    const title = (formData.get('title') as string) || ''
    const category = (formData.get('category') as string) || 'other'
    const thumbnailData = (formData.get('thumbnail') as string) || ''

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: '请上传文件' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: '文件过大（最大 100 MB）' }, { status: 413 })
    }

    const type = file.type.startsWith('image/')
      ? 'image'
      : file.type.startsWith('video/')
        ? 'video'
        : file.type.startsWith('audio/')
          ? 'audio'
          : null
    if (!type) {
      return NextResponse.json({ error: '不支持的文件类型' }, { status: 400 })
    }

    await mkdir(UPLOAD_DIR, { recursive: true })
    const matId = randomUUID()
    const ext = path.extname(file.name) || `.${file.type.split('/')[1]}`
    const diskName = `${matId}${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(path.join(UPLOAD_DIR, diskName), buffer)
    const url = `/uploads/materials/${diskName}`

    let thumbnailUrl: string | undefined
    if (thumbnailData.startsWith('data:')) {
      const thumbB64 = thumbnailData.split(',')[1]
      if (thumbB64) {
        const thumbBuf = Buffer.from(thumbB64, 'base64')
        const thumbName = `${matId}-thumb.jpg`
        await writeFile(path.join(UPLOAD_DIR, thumbName), thumbBuf)
        thumbnailUrl = `/uploads/materials/${thumbName}`
      }
    }
    if (!thumbnailUrl && type === 'image') thumbnailUrl = url

    const store = await loadStore(user.id)
    if (!store.categories.some((c) => c.id === category)) {
      const catLabel = category === 'ai-image' ? 'AI图片' : category === 'ai-video' ? 'AI视频' : category
      store.categories.push({ id: category, label: catLabel })
    }

    const material: StoredMaterial = {
      id: matId,
      title: title || file.name.replace(/\.[^.]+$/, ''),
      type,
      category,
      url,
      thumbnail: thumbnailUrl,
      filename: file.name,
      size: file.size,
      mimeType: file.type,
      createdAt: new Date().toISOString(),
    }
    store.materials.unshift(material)
    await saveStore(user.id, store)
    return NextResponse.json(material)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Material upload error:', msg)
    return NextResponse.json({ error: `上传失败: ${msg}` }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  try {
    const body = await request.json() as { id: string; title?: string; category?: string }
    const { id, title, category } = body
    if (!id) return NextResponse.json({ error: '缺少素材 ID' }, { status: 400 })

    const store = await loadStore(user.id)
    const material = store.materials.find((m) => m.id === id)
    if (!material) return NextResponse.json({ error: '素材不存在' }, { status: 404 })

    if (title !== undefined) material.title = title
    if (category !== undefined) material.category = category
    await saveStore(user.id, store)
    return NextResponse.json(material)
  } catch (err) {
    console.error('Material update error:', err)
    return NextResponse.json({ error: '更新失败' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺少素材 ID' }, { status: 400 })

    const store = await loadStore(user.id)
    const idx = store.materials.findIndex((m) => m.id === id)
    if (idx === -1) return NextResponse.json({ error: '素材不存在' }, { status: 404 })

    const [removed] = store.materials.splice(idx, 1)

    // Delete file from disk
    try {
      await unlink(path.join(process.cwd(), 'public', removed.url))
    } catch { /* already deleted */ }

    // Delete thumbnail from disk if separate
    if (removed.thumbnail && removed.thumbnail !== removed.url) {
      try {
        await unlink(path.join(process.cwd(), 'public', removed.thumbnail))
      } catch { /* already deleted */ }
    }

    await saveStore(user.id, store)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Material delete error:', err)
    return NextResponse.json({ error: '删除失败' }, { status: 500 })
  }
}
