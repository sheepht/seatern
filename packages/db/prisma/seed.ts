import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 開始種子資料...\n')

  // 清除所有資料（依賴順序）
  console.log('清除舊資料...')
  await prisma.seatingSnapshot.deleteMany()
  await prisma.avoidPair.deleteMany()
  await prisma.seatPreference.deleteMany()
  await prisma.guestTag.deleteMany()
  await prisma.edge.deleteMany()
  await prisma.guest.deleteMany()
  await prisma.table.deleteMany()
  await prisma.tag.deleteMany()
  await prisma.event.deleteMany()
  await prisma.user.deleteMany()
  console.log('舊資料已清除\n')

  // ─── 建立測試用戶 ──────────────────────────
  const testUser = await prisma.user.create({
    data: {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'test@example.com',
      name: '測試用戶',
    },
  })
  console.log(`✅ 建立用戶: ${testUser.name}`)

  // ─── 建立小型婚禮活動（50人 5桌）──────────
  const event = await prisma.event.create({
    data: {
      name: '志明與春嬌的婚禮',
      date: '2026-06-15',
      type: 'wedding',
      categories: ['男方', '女方', '共同'],
      ownerType: 'user',
      ownerId: testUser.id,
    },
  })
  console.log(`✅ 建立活動: ${event.name}`)

  // ─── 建立標籤 ─────────────────────────────
  const tagData = [
    { name: '大學同學', category: null },
    { name: '高中同學', category: '男方' },
    { name: '公司同事', category: null },
    { name: '家人', category: null },
    { name: '鄰居', category: '女方' },
  ]
  const tags: Record<string, string> = {}
  for (const t of tagData) {
    const tag = await prisma.tag.create({
      data: { eventId: event.id, name: t.name, category: t.category },
    })
    tags[t.name] = tag.id
  }
  console.log(`✅ 建立 ${tagData.length} 個標籤`)

  // ─── 建立賓客 ─────────────────────────────
  interface GuestInput {
    name: string
    aliases: string[]
    category: string
    relationScore: number
    rsvpStatus: 'confirmed' | 'declined' | 'pending'
    attendeeCount: number
    dietaryNote?: string
    specialNote?: string
    tags: string[]
  }

  const guestInputs: GuestInput[] = [
    // ─── 男方家人 (8人) ─────────
    { name: '陳爸爸', aliases: ['老陳'], category: '男方', relationScore: 3, rsvpStatus: 'confirmed', attendeeCount: 1, tags: ['家人'] },
    { name: '陳媽媽', aliases: ['陳太太'], category: '男方', relationScore: 3, rsvpStatus: 'confirmed', attendeeCount: 1, dietaryNote: '素食', tags: ['家人'] },
    { name: '陳志強', aliases: ['大哥'], category: '男方', relationScore: 3, rsvpStatus: 'confirmed', attendeeCount: 2, tags: ['家人'] },
    { name: '陳美玲', aliases: ['大姐'], category: '男方', relationScore: 3, rsvpStatus: 'confirmed', attendeeCount: 1, specialNote: '需要嬰兒椅', tags: ['家人'] },
    { name: '陳叔叔', aliases: ['二叔'], category: '男方', relationScore: 2, rsvpStatus: 'confirmed', attendeeCount: 2, tags: ['家人'] },
    { name: '陳嬸嬸', aliases: [], category: '男方', relationScore: 2, rsvpStatus: 'confirmed', attendeeCount: 1, tags: ['家人'] },
    // ─── 女方家人 (6人) ─────────
    { name: '林爸爸', aliases: ['林伯'], category: '女方', relationScore: 3, rsvpStatus: 'confirmed', attendeeCount: 1, tags: ['家人'] },
    { name: '林媽媽', aliases: ['林太太'], category: '女方', relationScore: 3, rsvpStatus: 'confirmed', attendeeCount: 1, tags: ['家人'] },
    { name: '林志偉', aliases: ['小偉', '阿偉'], category: '女方', relationScore: 3, rsvpStatus: 'confirmed', attendeeCount: 1, tags: ['家人'] },
    { name: '林美華', aliases: ['小華'], category: '女方', relationScore: 2, rsvpStatus: 'confirmed', attendeeCount: 2, specialNote: '需要嬰兒椅', tags: ['家人'] },
    // ─── 大學同學 (12人) ────────
    { name: '王大明', aliases: ['大明', 'David'], category: '男方', relationScore: 3, rsvpStatus: 'confirmed', attendeeCount: 1, tags: ['大學同學'] },
    { name: '李小華', aliases: ['小華', 'Lisa'], category: '男方', relationScore: 3, rsvpStatus: 'confirmed', attendeeCount: 2, tags: ['大學同學'] },
    { name: '張雅婷', aliases: ['婷婷'], category: '男方', relationScore: 2, rsvpStatus: 'confirmed', attendeeCount: 1, tags: ['大學同學'] },
    { name: '劉建宏', aliases: ['阿宏'], category: '男方', relationScore: 2, rsvpStatus: 'confirmed', attendeeCount: 1, dietaryNote: '不吃牛', tags: ['大學同學'] },
    { name: '黃詩涵', aliases: ['涵涵'], category: '男方', relationScore: 2, rsvpStatus: 'confirmed', attendeeCount: 1, tags: ['大學同學'] },
    { name: '趙子龍', aliases: ['子龍'], category: '男方', relationScore: 2, rsvpStatus: 'confirmed', attendeeCount: 2, tags: ['大學同學'] },
    { name: '周杰倫', aliases: ['Jay'], category: '男方', relationScore: 1, rsvpStatus: 'confirmed', attendeeCount: 1, tags: ['大學同學'] },
    { name: '吳宗憲', aliases: ['憲哥'], category: '男方', relationScore: 1, rsvpStatus: 'confirmed', attendeeCount: 1, tags: ['大學同學'] },
    { name: '蔡依琳', aliases: ['Jolin'], category: '女方', relationScore: 2, rsvpStatus: 'confirmed', attendeeCount: 1, tags: ['大學同學'] },
    { name: '許志安', aliases: ['安仔'], category: '男方', relationScore: 1, rsvpStatus: 'confirmed', attendeeCount: 1, tags: ['大學同學'] },
    { name: '鄭秀文', aliases: ['Sammi'], category: '女方', relationScore: 2, rsvpStatus: 'confirmed', attendeeCount: 1, tags: ['大學同學'] },
    { name: '謝霆鋒', aliases: ['霆鋒'], category: '男方', relationScore: 1, rsvpStatus: 'confirmed', attendeeCount: 1, dietaryNote: '素食', tags: ['大學同學'] },
    // ─── 公司同事 (10人) ────────
    { name: '方主管', aliases: ['方姐'], category: '共同', relationScore: 2, rsvpStatus: 'confirmed', attendeeCount: 1, tags: ['公司同事'] },
    { name: '楊經理', aliases: ['楊哥'], category: '共同', relationScore: 2, rsvpStatus: 'confirmed', attendeeCount: 2, tags: ['公司同事'] },
    { name: '何小敏', aliases: ['小敏'], category: '共同', relationScore: 2, rsvpStatus: 'confirmed', attendeeCount: 1, tags: ['公司同事'] },
    { name: '孫大偉', aliases: ['大偉'], category: '共同', relationScore: 1, rsvpStatus: 'confirmed', attendeeCount: 1, tags: ['公司同事'] },
    { name: '馬小雲', aliases: ['小雲', 'Jack'], category: '共同', relationScore: 1, rsvpStatus: 'confirmed', attendeeCount: 1, tags: ['公司同事'] },
    { name: '郭台明', aliases: ['Terry'], category: '共同', relationScore: 1, rsvpStatus: 'confirmed', attendeeCount: 1, dietaryNote: '不吃海鮮', tags: ['公司同事'] },
    { name: '高中華', aliases: ['中華'], category: '共同', relationScore: 1, rsvpStatus: 'confirmed', attendeeCount: 1, tags: ['公司同事'] },
    { name: '呂美玉', aliases: ['美玉'], category: '共同', relationScore: 1, rsvpStatus: 'confirmed', attendeeCount: 1, tags: ['公司同事'] },
    { name: '蘇小安', aliases: ['小安', 'Ann'], category: '共同', relationScore: 2, rsvpStatus: 'confirmed', attendeeCount: 1, tags: ['公司同事'] },
    { name: '葉文龍', aliases: ['文龍'], category: '共同', relationScore: 1, rsvpStatus: 'confirmed', attendeeCount: 1, tags: ['公司同事'] },
    // ─── 高中同學 (8人) ─────────
    { name: '鍾小明', aliases: ['小明', '明仔'], category: '男方', relationScore: 2, rsvpStatus: 'confirmed', attendeeCount: 1, tags: ['高中同學'] },
    { name: '溫美麗', aliases: ['美麗', 'Mary'], category: '男方', relationScore: 2, rsvpStatus: 'confirmed', attendeeCount: 2, tags: ['高中同學'] },
    { name: '戴志豪', aliases: ['阿豪'], category: '男方', relationScore: 2, rsvpStatus: 'confirmed', attendeeCount: 1, tags: ['高中同學'] },
    { name: '范小青', aliases: ['小青'], category: '男方', relationScore: 1, rsvpStatus: 'confirmed', attendeeCount: 1, tags: ['高中同學'] },
    { name: '湯大同', aliases: ['大同'], category: '男方', relationScore: 1, rsvpStatus: 'confirmed', attendeeCount: 1, tags: ['高中同學'] },
    { name: '彭小芳', aliases: ['小芳'], category: '男方', relationScore: 1, rsvpStatus: 'confirmed', attendeeCount: 1, dietaryNote: '素食', tags: ['高中同學'] },
    // ─── 孤立賓客 (3人) ─────────
    { name: '張三', aliases: [], category: '男方', relationScore: 1, rsvpStatus: 'confirmed', attendeeCount: 1, tags: [] },
    { name: '王大嬸', aliases: [], category: '女方', relationScore: 1, rsvpStatus: 'confirmed', attendeeCount: 1, tags: ['鄰居'] },
    { name: '陌生人阿強', aliases: ['阿強'], category: '共同', relationScore: 1, rsvpStatus: 'confirmed', attendeeCount: 1, tags: [] },
    // ─── 婉拒賓客 (3人) ─────────
    { name: '不來先生', aliases: [], category: '男方', relationScore: 1, rsvpStatus: 'declined', attendeeCount: 1, tags: ['高中同學'] },
    { name: '沒空小姐', aliases: ['小空'], category: '女方', relationScore: 1, rsvpStatus: 'declined', attendeeCount: 1, tags: ['公司同事'] },
    { name: '出國先生', aliases: [], category: '男方', relationScore: 2, rsvpStatus: 'declined', attendeeCount: 1, tags: ['大學同學'] },
  ]

  const guestMap: Record<string, string> = {} // name → id

  for (const g of guestInputs) {
    const guest = await prisma.guest.create({
      data: {
        eventId: event.id,
        name: g.name,
        aliases: g.aliases,
        category: g.category,
        relationScore: g.relationScore,
        rsvpStatus: g.rsvpStatus,
        attendeeCount: g.attendeeCount,
        dietaryNote: g.dietaryNote,
        specialNote: g.specialNote,
      },
    })
    guestMap[g.name] = guest.id

    // 建立 GuestTag
    for (const tagName of g.tags) {
      if (tags[tagName]) {
        await prisma.guestTag.create({
          data: { guestId: guest.id, tagId: tags[tagName] },
        })
      }
    }
  }

  const confirmed = guestInputs.filter((g) => g.rsvpStatus === 'confirmed')
  const totalSeats = confirmed.reduce((sum, g) => sum + g.attendeeCount, 0)
  console.log(`✅ 建立 ${guestInputs.length} 位賓客（${confirmed.length} 確認, ${guestInputs.length - confirmed.length} 婉拒, 共 ${totalSeats} 席）`)

  // ─── 建立桌次（5桌）───────────────────────
  const tableData = [
    { name: '主桌（家人）', capacity: 12, positionX: 400, positionY: 150 },
    { name: '大學同學桌', capacity: 10, positionX: 200, positionY: 350 },
    { name: '公司同事桌', capacity: 10, positionX: 600, positionY: 350 },
    { name: '高中同學桌', capacity: 10, positionX: 200, positionY: 550 },
    { name: '混合桌', capacity: 10, positionX: 600, positionY: 550 },
  ]

  const tableMap: Record<string, string> = {}
  for (const t of tableData) {
    const table = await prisma.table.create({
      data: { eventId: event.id, ...t },
    })
    tableMap[t.name] = table.id
  }
  console.log(`✅ 建立 ${tableData.length} 桌`)

  // ─── 建立「想同桌」偏好 ────────────────────
  const preferences = [
    // 雙向：王大明 ↔ 李小華
    { from: '王大明', to: '李小華', rank: 1 },
    { from: '李小華', to: '王大明', rank: 1 },
    // 雙向：張雅婷 ↔ 劉建宏
    { from: '張雅婷', to: '劉建宏', rank: 1 },
    { from: '劉建宏', to: '張雅婷', rank: 1 },
    // 單向：黃詩涵 → 王大明（王大明沒選她）
    { from: '黃詩涵', to: '王大明', rank: 1 },
    { from: '黃詩涵', to: '張雅婷', rank: 2 },
    // 單向：鍾小明 → 王大明（跨群組：高中→大學）
    { from: '鍾小明', to: '王大明', rank: 1 },
    // 公司同事偏好
    { from: '何小敏', to: '蘇小安', rank: 1 },
    { from: '蘇小安', to: '何小敏', rank: 1 },
    { from: '馬小雲', to: '郭台明', rank: 1 },
  ]

  for (const p of preferences) {
    if (guestMap[p.from] && guestMap[p.to]) {
      await prisma.seatPreference.create({
        data: {
          guestId: guestMap[p.from],
          preferredGuestId: guestMap[p.to],
          rank: p.rank,
        },
      })
    }
  }
  console.log(`✅ 建立 ${preferences.length} 個座位偏好`)

  // ─── 建立避免同桌 ─────────────────────────
  const avoidPairs = [
    { a: '許志安', b: '鄭秀文', reason: '前任關係' },
    { a: '陳叔叔', b: '林志偉', reason: '家庭糾紛' },
  ]

  for (const ap of avoidPairs) {
    if (guestMap[ap.a] && guestMap[ap.b]) {
      await prisma.avoidPair.create({
        data: {
          eventId: event.id,
          guestAId: guestMap[ap.a],
          guestBId: guestMap[ap.b],
          reason: ap.reason,
        },
      })
    }
  }
  console.log(`✅ 建立 ${avoidPairs.length} 對避免同桌`)

  // ─── 統計 ─────────────────────────────────
  console.log('\n📊 Seed 統計：')
  console.log(`   賓客：${guestInputs.length} 人（確認 ${confirmed.length}、婉拒 ${guestInputs.length - confirmed.length}）`)
  console.log(`   總席位需求：${totalSeats} 席`)
  console.log(`   桌次：${tableData.length} 桌（總容量 ${tableData.reduce((s, t) => s + t.capacity, 0)} 席）`)
  console.log(`   標籤：${tagData.length} 個`)
  console.log(`   座位偏好：${preferences.length} 個（含雙向 + 單向）`)
  console.log(`   避免同桌：${avoidPairs.length} 對`)
  console.log(`   孤立賓客：3 位（張三、王大嬸、陌生人阿強）`)
  console.log(`   帶眷屬：5 位（attendeeCount=2）`)
  console.log(`   嬰兒椅需求：2 位`)
  console.log('\n✅ 種子資料完成！')
}

main()
  .catch((e) => {
    console.error('❌ 種子資料失敗：', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
