import { Schema, model } from 'mongoose'

const departmentSchema = new Schema({
  name: {
    type: String,
    required: [true, '請輸入部門名稱']
  },
  departmentId: {
    type: String,
    unique: true
  },
  companyId: {
    type: Number,
    required: [true, '請選擇所屬公司'],
    enum: [1, 2, 3, 4, 5, 6, 7, 8] // 限制可用的公司 ID
  }
}, {
  timestamps: true,
  versionKey: false
})

departmentSchema.index({ name: 1, companyId: 1 }, { unique: true })

export default model('departments', departmentSchema)
