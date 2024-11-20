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
    lowercase: true,
    validate: [validator.isEmail, '個人Email格式不正確']
  },
  IDNumber: {
    type: String,
    uppercase: true,
    validate: {
      validator: function (v) {
        return /^[A-Z][12]\d{8}$/.test(v)
      },
      message: '身分證號碼格式不正確'
    }
  },
  gender: {
    type: String,
    enum: ['男性', '女性']
  },
  cellphone: {
    type: String,
    validate: {
      validator: function (v) {
        return /^09\d{8}$/.test(v)
      },
      message: '手機號碼格式不正確'
    }
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
  company: {
    type: ObjectId,
    ref: 'companies'
  },
  department: {
    type: ObjectId,
    ref: 'departments'
  },
  jobTitle: {
    type: String
  },
  salary: {
    type: String
  },
  extNumber: {
    type: String
  },
  effectiveDate: {
    type: Date
  },
  status: {
    type: String,
    enum: ['待面試', '待入職', '已完成', '已取消'],
    default: '待面試'
  },
  seatDescription: {
    type: String
  },
  note: {
    type: String
  },
  isTransferred: {
    type: Boolean,
    default: false
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

// 索引
tempUserSchema.index({
  status: 1,
  company: 1,
  department: 1
})

export default model('tempUsers', tempUserSchema)
