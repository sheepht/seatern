import { PrismaClient } from '@prisma/client'
import { seedWedding } from './seed/create-wedding.js'
import { seedCorporate } from './seed/create-corporate.js'
import { resetUsedNames } from './seed/helpers.js'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 開始種子資料...\n')
  const start = Date.now()

  // 清除所有資料（葉到根）
  console.log('清除舊資料...')
  await prisma.edge.deleteMany()
  await prisma.seatPreference.deleteMany()
  await prisma.guestTag.deleteMany()
  await prisma.seatingSnapshot.deleteMany()
  await prisma.guest.deleteMany()
  await prisma.table.deleteMany()
  await prisma.tag.deleteMany()
  await prisma.event.deleteMany()
  await prisma.contact.deleteMany()
  await prisma.user.deleteMany()
  console.log('舊資料已清除')

  // 重置姓名使用記錄
  resetUsedNames()

  // 場景 1：婚禮
  await seedWedding(prisma)

  // 場景 2：公司尾牙
  await seedCorporate(prisma)

  // 統計
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log('\n📊 種子資料統計：')
  console.log(`  Users:           ${await prisma.user.count()}`)
  console.log(`  Contacts:        ${await prisma.contact.count()}`)
  console.log(`  Events:          ${await prisma.event.count()}`)
  console.log(`  Guests:          ${await prisma.guest.count()}`)
  console.log(`  Tags:            ${await prisma.tag.count()}`)
  console.log(`  GuestTags:       ${await prisma.guestTag.count()}`)
  console.log(`  Tables:          ${await prisma.table.count()}`)
  console.log(`  SeatPreferences: ${await prisma.seatPreference.count()}`)
  console.log(`  Edges:           ${await prisma.edge.count()}`)
  console.log(`\n✅ 種子資料完成！耗時 ${elapsed} 秒`)
}

main()
  .catch((e) => {
    console.error('❌ 種子資料失敗：', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
