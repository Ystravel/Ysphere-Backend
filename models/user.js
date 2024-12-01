import { Schema, model, Error, ObjectId } from 'mongoose'
import bcrypt from 'bcrypt'
import UserRole from '../enums/UserRole.js'

// const todoSchema = new Schema({
//   userId: {
//     type: ObjectId,
//     ref: 'users',
//     required: true
//   },
//   title: {
//     type: String,
//     required: [true, '請輸入待辦事項標題']
//   },
//   description: {
//     type: String
//   },
//   dueDate: {
//     type: Date
//   },
//   priority: {
//     type: String,
//     enum: ['低', '中', '高'],
//     default: '中'
//   },
//   status: {
//     type: String,
//     enum: ['待處理', '進行中', '已完成'],
//     default: '待處理'
//   },
//   reminder: {
//     enabled: { // 是否啟用提醒
//       type: Boolean,
//       default: false
//     },
//     time: Date, // 提醒時間
//     isNotified: { // 是否已發送通知
//       type: Boolean,
//       default: false
//     },
//     repeatType: { // 重複類型
//       type: String,
//       enum: ['一次性', '每天', '每週', '每月'],
//       default: '一次性'
//     }
//   }
// }, {
//   timestamps: true, // 待辦事項建立時間、更新時間
//   versionKey: false
// })

const dependentInsuranceSchema = new Schema({
  dependentName: {
    type: String,
    required: [true, '請輸入眷屬姓名']
  },
  dependentRelationship: {
    type: String
  },
  dependentBirthDate: {
    type: Date,
    required: [true, '請輸入眷屬生日']
  },
  dependentIDNumber: {
    type: String,
    required: [true, '請輸入眷屬身分證號碼']
  },
  dependentInsuranceStartDate: {
    type: Date
  },
  dependentInsuranceEndDate: {
    type: Date
  }
})

const schema = new Schema({
  name: {
    type: String,
    required: [true, '請輸入使用者姓名']
  },
  englishName: {
    type: String,
    uppercase: true
  },
  IDNumber: {
    type: String,
    required: [true, '請輸入身分證號碼'],
    unique: true,
    uppercase: true
  },
  birthDate: {
    type: Date,
    required: [true, '請輸入生日']
  },
  gender: {
    type: String,
    enum: ['男性', '女性'],
    required: [true, '請選擇性別']
  },
  personalEmail: { // 個人email
    type: String,
    lowercase: true
  },
  permanentAddress: {
    type: String,
    required: [true, '請輸入戶籍地址']
  },
  contactAddress: {
    type: String,
    required: [true, '請輸入通訊地址']
  },
  email: { // 公司email
    type: String,
    unique: true,
    lowercase: true,
    required: [true, '請輸入公司email']
  },

  password: {
    type: String,
    required: [true, '請輸入使用者密碼']
  },

  phoneNumber: {
    type: String
  },
  cellphone: {
    type: String
  },
  salary: {
    type: String
  },
  extNumber: {
    type: String
  },
  printNumber: {
    type: String
  },
  emergencyName: {
    type: String
  },
  emergencyPhoneNumber: {
    type: String
  },
  emergencyCellphone: {
    type: String
  },
  emergencyRelationship: {
    type: String
  },
  company: {
    type: ObjectId,
    ref: 'companies',
    required: true
  },
  department: {
    type: ObjectId,
    ref: 'departments',
    required: true
  },
  jobTitle: {
    type: String
  },
  role: {
    type: Number,
    default: UserRole.USER
  },
  cowellAccount: {
    type: String
  },
  cowellPassword: {
    type: String
  },
  userId: {
    type: String,
    sparse: true,
    unique: true,
    uppercase: true,
    set: v => (v === '' ? null : v)
  },
  employmentStatus: {
    type: String,
    enum: ['在職', '離職', '退休', '留職停薪'],
    default: '在職'
  },
  hireDate: {
    type: Date,
    required: [true, '請輸入入職日期']
  },
  resignationDate: {
    type: Date
  },

  note: {
    type: String
  },

  // 20241123 新增欄位

  healthInsuranceStartDate: {
    type: Date,
    default: null
  },
  healthInsuranceEndDate: {
    type: Date
  },
  laborInsuranceStartDate: {
    type: Date
  },
  laborInsuranceEndDate: {
    type: Date
  },
  salaryBank: { // 薪轉銀行(代碼+名稱)
    type: String
  },
  salaryBankBranch: { // 薪轉銀行分行
    type: String
  },
  salaryAccountNumber: { // 薪轉銀行帳號
    type: String
  },
  guideLicense: { // 導遊證  // 待處理
    type: [Number], // 陣列
    enum: [0, 1, 2, 3, 4],
    default: []
  },
  tourManager: { // 旅遊經理人
    type: Boolean
  },
  YSRCAccount: {
    type: String
  },
  YSRCPassword: {
    type: String
  },
  YS168Account: {
    type: String
  },
  YS168Password: {
    type: String
  },
  disabilityStatus: { // 身心障礙
    type: String,
    enum: ['否', '輕度', '中度'],
    default: '無'
  },
  indigenousStatus: { // 是否為原住民
    type: Boolean,
    default: false
  },
  voluntaryPensionRate: {
    type: Number
  },
  voluntaryPensionStartDate: {
    type: Date
  },
  voluntaryPensionEndDate: {
    type: Date
  },
  dependentInsurance: { // 待處理
    type: [dependentInsuranceSchema]
  },
  tourismReportDate: {
    type: Date
  },
  formStatus: {
    type: String,
    enum: ['尚未完成', '尚缺資料', '已完成'],
    default: '尚未完成'
  },
  resetPasswordToken: {
    type: String,
    default: undefined
  },
  resetPasswordExpires: {
    type: Date,
    default: undefined
  },
  lastEmailSent: { // 新增欄位跟蹤最後一次發送郵件的時間
    type: Date,
    default: undefined
  },
  avatar: {
    type: String,
    default: 'https://res.cloudinary.com/dcwkukgf3/image/upload/v1731628234/avatar_robot_small_hzzbom.jpg'
  },
  // todos: {
  //   type: [todoSchema],
  //   default: []
  // },
  isFirstLogin: {
    type: Boolean,
    default: true
  },
  tokens: {
    type: [String]
  }
}, {
  timestamps: true, // 使用者帳號建立時間、更新時間
  versionKey: false
})

schema.index(
  { resetPasswordExpires: 1 },
  {
    expireAfterSeconds: 1800, // 設定為 30 分鐘
    background: true // 在後台建立索引，避免阻塞應用
  }
)

schema.pre('save', function (next) {
  const user = this // this 指向 User model
  if (user.isModified('password')) {
    if (user.password.length < 8) {
      const error = new Error.ValidationError()
      error.addError('password', new Error.ValidatorError({ message: '使用者密碼長度不符' }))
      next(error)
      return
    } else {
      user.password = bcrypt.hashSync(user.password, 10)
    }
  }
  next()
})

export default model('users', schema)
