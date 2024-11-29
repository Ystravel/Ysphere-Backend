import { Schema, model } from 'mongoose'

const formTemplateSchema = new Schema({
  name: {
    type: String,
    required: [true, '請輸入表單名稱'],
    unique: true
  },
  company: {
    type: Schema.Types.ObjectId,
    ref: 'companies',
    required: [true, '請選擇公司']
  },
  type: {
    type: String,
    required: [true, '請選擇表單類型'],
    enum: ['quotation', 'purchase', 'leave']
  },
  componentName: {
    type: String,
    required: [true, '請輸入組件名稱']
  }
}, {
  timestamps: true
})

// 建立索引
formTemplateSchema.index({ name: 1 })
formTemplateSchema.index({ company: 1 })

export default model('formTemplates', formTemplateSchema)
