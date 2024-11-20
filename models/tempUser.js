import { Schema, model, ObjectId } from 'mongoose'
import validator from 'validator'

const tempUserSchema = new Schema({
  // 基本資料
  name: {
    type: String,
    required: [true, '請輸入姓名']
  },
  englishName: {
    type: String,
    uppercase: true
  },
  personalEmail: {
    type: String,
    unique: true,
    validate: [validator.isEmail, '電子郵件格式不正確'],
    lowercase: true
  },
  IDNumber: {
    type: String,
    uppercase: true
  },
  gender: {
    type: String,
    enum: ['男性', '女性']
  },
  cellphone: {
    type: String
  },
  birthDate: {
    type: Date
  },
  permanentAddress: {
    type: String
  },
  contactAddress: {
    type: String
  },

  // 緊急聯絡人
  emergencyName: {
    type: String
  },
  emergencyCellphone: {
    type: String
  },
  emergencyRelationship: {
    type: String
  },

  // 工作相關
  plannedCompany: {
    type: ObjectId,
    ref: 'companies'
  },
  plannedDepartment: {
    type: ObjectId,
    ref: 'departments'
  },
  plannedJobTitle: {
    type: String
  },
  plannedSalary: {
    type: String
  },
  plannedExtNumber: {
    type: String
  },
  effectiveDate: { // 任何生效日 例如: 預計面試日期、預計報到日期、預計離職日期、預計留職停薪日期、預計退休日期
    type: Date
  },

  // 狀態
  status: {
    type: String,
    enum: ['待面試', '待入職', '待離職', '待留停', '待退休', '待處理', '已處理', '已取消'],
    default: '待入職'
  },
  seatDescription: { // 座位描述
    type: String
  },
  note: { // 備註
    type: String
  },

  // 追蹤欄位
  createdBy: {
    type: ObjectId,
    ref: 'users',
    required: true
  },
  lastModifiedBy: {
    type: ObjectId,
    ref: 'users'
  }
}, {
  timestamps: true,
  versionKey: false
})

export default model('tempUser', tempUserSchema)
