import { Schema, model, Error, ObjectId } from 'mongoose'
import validator from 'validator'
import bcrypt from 'bcrypt'
import UserRole from '../enums/UserRole.js'

const todoSchema = new Schema({
  userId: {
    type: ObjectId,
    ref: 'users',
    required: true
  },
  title: {
    type: String,
    required: [true, '請輸入待辦事項標題']
  },
  description: {
    type: String
  },
  dueDate: {
    type: Date
  },
  priority: {
    type: String,
    enum: ['低', '中', '高'],
    default: '中'
  },
  status: {
    type: String,
    enum: ['待處理', '進行中', '已完成'],
    default: '待處理'
  },
  reminder: {
    enabled: { // 是否啟用提醒
      type: Boolean,
      default: false
    },
    time: Date, // 提醒時間
    isNotified: { // 是否已發送通知
      type: Boolean,
      default: false
    },
    repeatType: { // 重複類型
      type: String,
      enum: ['一次性', '每天', '每週', '每月'],
      default: '一次性'
    }
  }
}, {
  timestamps: true, // 待辦事項建立時間、更新時間
  versionKey: false
})

const schema = new Schema({
  email: {
    type: String,
    required: [true, '請輸入使用者電子郵件'],
    unique: true,
    validate: [validator.isEmail, '使用者電子郵件格式不正確'],
    lowercase: true
  },
  personalEmail: {
    type: String,
    lowercase: true
  },
  password: {
    type: String,
    required: [true, '請輸入使用者密碼']
  },
  IDNumber: {
    type: String,
    required: [true, '請輸入身分證號碼'],
    unique: true,
    uppercase: true
  },
  gender: {
    type: String,
    enum: ['男性', '女性'],
    required: [true, '請選擇性別']
  },
  name: {
    type: String,
    required: [true, '請輸入使用者姓名']
  },
  englishName: {
    type: String,
    required: [true, '請輸入使用者英文名'],
    uppercase: true
  },
  cellphone: {
    type: String,
    required: [true, '請輸入手機號碼'],
    unique: true
  },
  salary: {
    type: String
  },
  extNumber: {
    type: String,
    required: [true, '請輸入分機號碼'],
    unique: true
  },
  birthDate: {
    type: Date,
    required: [true, '請輸入生日']
  },
  permanentAddress: {
    type: String,
    required: [true, '請輸入戶籍地址']
  },
  contactAddress: {
    type: String,
    required: [true, '請輸入通訊地址']
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
    type: String,
    required: [true, '請輸入職稱']
  },
  role: {
    type: Number,
    default: UserRole.USER
  },
  cowellAccount: {
    type: String,
    required: [true, '請輸入科威帳號'],
    unique: true
  },
  cowellPassword: {
    type: String,
    required: [true, '請輸入科威密碼']
  },
  // nasAccount: {
  //   type: String,
  //   // required: [true, '請輸入 NAS 帳號'],
  //   unique: true
  // },
  // nasPassword: {
  //   type: String
  //   // required: [true, '請輸入 NAS 密碼']
  // },
  guideLicense: {
    type: Boolean,
    default: false
  },
  userId: {
    type: String,
    unique: true
  },
  employmentStatus: {
    type: String,
    enum: ['在職', '離職', '退休', '留職停薪'],
    default: '在職'
  },
  hireDate: {
    type: Date,
    default: Date.now,
    required: [true, '請輸入入職日期']
  },
  resignationDate: {
    type: Date
  },
  emergencyName: {
    type: String,
    required: [true, '請輸入緊急聯絡人姓名']
  },
  emergencyCellphone: {
    type: String,
    required: [true, '請輸入緊急聯絡人連絡電話']
  },
  emergencyRelationship: {
    type: String
  },
  printNumber: {
    type: String,
    unique: true
  },
  note: {
    type: String
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
  todos: {
    type: [todoSchema],
    default: []
  },
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
  {
    resetPasswordToken: 1,
    resetPasswordExpires: 1
  },
  {
    sparse: true,
    background: true,
    expireAfterSeconds: 1800 // 30分鐘後自動刪除過期的重置token
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
