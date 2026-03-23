import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 開始種子資料...\n')

  // 清除所有資料
  console.log('清除舊資料...')
  await prisma.user.deleteMany()
  console.log('舊資料已清除')

  // TODO: 加入新的種子資料

  console.log('\n✅ 種子資料完成！')
}

main()
  .catch((e) => {
    console.error('❌ 種子資料失敗：', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
