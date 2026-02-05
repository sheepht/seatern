// 中文姓名常量 & 活動設定

export const SURNAMES = [
  '陳', '林', '黃', '張', '李', '王', '吳', '劉', '蔡', '楊',
  '許', '鄭', '謝', '洪', '郭', '邱', '曾', '廖', '賴', '徐',
  '周', '葉', '蘇', '莊', '呂', '江', '何', '蕭', '羅', '高',
  '潘', '簡', '朱', '鍾', '彭', '游', '詹', '胡', '施', '沈',
]

export const GIVEN_NAME_CHARS = [
  '志', '明', '美', '玲', '建', '宏', '淑', '惠', '俊', '偉',
  '雅', '婷', '文', '華', '秀', '英', '國', '豪', '怡', '君',
  '芳', '珍', '正', '龍', '嘉', '慧', '家', '瑋', '欣', '宜',
  '信', '儀', '裕', '翔', '琪', '如', '佳', '蓉', '銘', '勝',
  '承', '恩', '柏', '宇', '昌', '育', '德', '仁', '靜', '萍',
  '彥', '廷', '安', '晴', '詩', '涵', '哲', '維', '瑜', '庭',
  '峰', '榮', '智', '傑', '威', '凱', '雯', '馨', '芬', '琳',
  '耀', '鑫', '宗', '達', '敏', '玉', '梅', '蘭', '霖', '澤',
]

export const ALIAS_PREFIXES = ['小', '阿']

export const DIETARY_OPTIONS = ['素食', '不吃牛', '海鮮過敏', '花生過敏', '蛋奶素']
export const SPECIAL_NEEDS_OPTIONS = ['輪椅', '兒童椅', '靠近出口', '靠近舞台']

// ─── 婚禮場景設定 ───

export interface TagConfig {
  name: string
  category?: string
  estimatedCount: number // 預估這個 tag 會有多少人
}

export interface ScenarioConfig {
  eventName: string
  eventDate: string
  eventType: 'WEDDING' | 'BANQUET' | 'CORPORATE' | 'OTHER'
  categories: string[]
  tags: TagConfig[]
  guestCount: number
  tableCount: number
  tableCapacity: number
  categoryDistribution: Record<string, number> // category -> percentage (0-1)
}

export const WEDDING_CONFIG: ScenarioConfig = {
  eventName: '志明 & 春嬌 婚禮',
  eventDate: '2026-06-15',
  eventType: 'WEDDING',
  categories: ['男方', '女方', '共同'],
  tags: [
    { name: '男方家人', category: '男方', estimatedCount: 18 },
    { name: '女方家人', category: '女方', estimatedCount: 16 },
    { name: '大學同學', category: '男方', estimatedCount: 14 },
    { name: '高中同學', category: '女方', estimatedCount: 12 },
    { name: '男方公司同事', category: '男方', estimatedCount: 20 },
    { name: '女方公司同事', category: '女方', estimatedCount: 18 },
    { name: '教會朋友', category: '共同', estimatedCount: 15 },
    { name: '社團朋友', category: '共同', estimatedCount: 12 },
    { name: '鄰居長輩', category: '男方', estimatedCount: 10 },
    { name: '共同朋友', category: '共同', estimatedCount: 10 },
  ],
  guestCount: 145,
  tableCount: 15,
  tableCapacity: 10,
  categoryDistribution: { '男方': 0.45, '女方': 0.45, '共同': 0.10 },
}

export const CORPORATE_CONFIG: ScenarioConfig = {
  eventName: '鼎新科技 2026 尾牙',
  eventDate: '2026-01-20',
  eventType: 'CORPORATE',
  categories: ['研發部', '業務部', '行銷部', '人資部', '財務部', '管理層'],
  tags: [
    { name: '新人', estimatedCount: 60 },
    { name: '資深員工', estimatedCount: 120 },
    { name: '主管', estimatedCount: 50 },
    { name: '特約人員', estimatedCount: 30 },
    { name: '眷屬', estimatedCount: 80 },
    { name: 'VIP', estimatedCount: 20 },
    { name: '表演者', estimatedCount: 22 },
    { name: '素食', estimatedCount: 20 },
  ],
  guestCount: 402,
  tableCount: 40,
  tableCapacity: 10,
  categoryDistribution: {
    '研發部': 0.30,
    '業務部': 0.25,
    '行銷部': 0.15,
    '人資部': 0.10,
    '財務部': 0.10,
    '管理層': 0.10,
  },
}

// 桌次顏色（可選）
export const TABLE_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E', '#06B6D4',
  '#3B82F6', '#8B5CF6', '#EC4899', '#F43F5E', '#14B8A6',
]
