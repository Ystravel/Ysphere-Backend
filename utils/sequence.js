/* eslint-disable camelcase */
import User from '../models/user.js'
import ServiceTicket from '../models/serviceTicket.js'
import Company from '../models/company.js'
import Form from '../models/form.js'

/**
 * 獲取下一個可用的員工編號
 * @returns {Promise<string>} 格式化的員工編號 (例如: '0014')
 */
/**
 * 獲取下一個可用的員工編號
 * @param {string} departmentId - 部門ID (例如: 'A1IT', 'A1FM')
 * @returns {Promise<string>} 格式化的員工編號 (例如: 'A1IT001', 'A1FM001')
 */
export const getNextUserNumber = async (departmentId) => {
  // 查找該部門下所有用戶的 userId
  const users = await User.aggregate([
    {
      $lookup: {
        from: 'departments',
        localField: 'department',
        foreignField: '_id',
        as: 'departmentInfo'
      }
    },
    {
      $unwind: '$departmentInfo'
    },
    {
      $match: {
        'departmentInfo.departmentId': departmentId
      }
    }
  ])

  if (users.length === 0) {
    // 該部門第一位員工
    return `${departmentId}001`
  }

  // 提取現有員工編號的序號部分並找出最大值
  const numbers = users
    .map(user => {
      const match = user.userId.match(/\d+$/)
      return match ? parseInt(match[0]) : 0
    })
    .filter(num => !isNaN(num))

  const maxNumber = Math.max(...numbers)

  // 返回下一個序號
  return `${departmentId}${String(maxNumber + 1).padStart(3, '0')}`
}

/**
 * 獲取下一個可用的公司編號
 * 編碼規則: A1 -> A2 -> ... -> A9 -> B1 -> ... -> Z9 (不包含0)
 * @returns {Promise<string>} 格式化的公司編號
 */
export const getNextCompanyNumber = async () => {
  // 查詢資料庫中所有公司編號
  const companies = await Company.find({}, { companyId: 1 })

  if (companies.length === 0) {
    return 'A1' // 沒有公司時，從 A1 開始
  }

  // 提取所有公司編號並排序
  const codes = companies.map((company) => company.companyId).sort()

  // 找到資料庫中的最大編號
  const maxCode = codes.pop() // 例如 "A9" 或 "B3"
  const letter = maxCode[0] // 取得字母部分
  const number = parseInt(maxCode[1]) // 取得數字部分

  if (number < 9) {
    // 如果數字部分小於 9，遞增數字
    return `${letter}${number + 1}`
  } else {
    // 如果數字部分已達 9，切換到下一個字母區段
    const nextLetter = String.fromCharCode(letter.charCodeAt(0) + 1)
    if (nextLetter > 'Z') {
      throw new Error('已超出公司編號範圍，無法生成新公司編號')
    }
    return `${nextLetter}1`
  }
}

/**
 * 獲取下一個可用的服務請求編號
 * @returns {Promise<string>} 格式化的服務請求編號 (例如: 'IT24110001')
 */
export const getNextTicketNumber = async () => {
  const today = new Date()
  const year = today.getFullYear().toString().slice(-2) // 只年份後兩位
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const prefix = `IT${year}${month}`

  // 查找當月的所有服務請求
  const tickets = await ServiceTicket.find({
    ticketId: new RegExp(`^${prefix}`)
  }, { ticketId: 1 })

  // 提取序號部分
  const numbers = tickets
    .map(ticket => {
      const match = ticket.ticketId.match(/\d{4}$/)
      return match ? parseInt(match[0]) : 0
    })
    .filter(num => !isNaN(num))

  // 如果當月沒有請求，從 1 開始
  if (numbers.length === 0) {
    return `${prefix}0001`
  }

  // 找到最大的序號
  const maxNumber = Math.max(...numbers)
  // 返回下一個序號
  return `${prefix}${String(maxNumber + 1).padStart(4, '0')}`
}

/**
 * 獲取下一個表單編號
 * @param {string} formType - 表單類型 (QT: 報價單, AP: 申請單, EX: 出差申請)
 * @returns {Promise<string>} 格式化的表單編號 (例如: 202411290001)
 */
export const getNextFormNumber = async (formType) => {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  const monthPrefix = `${year}${month}` // 年月前綴

  // 查找當月的所有特定類型表單
  const forms = await Form.find({
    formNumber: new RegExp(`^${monthPrefix}`),
    formType // 加入表單類型條件
  }, { formNumber: 1 }).sort({ formNumber: -1 }) // 按編號降序排序

  // 如果當月沒有表單，從 1 開始
  if (forms.length === 0) {
    return `${year}${month}${day}0001`
  }

  // 取得當月最大序號
  const lastForm = forms[0]
  const currentNumber = parseInt(lastForm.formNumber.slice(-4))
  const nextNumber = String(currentNumber + 1).padStart(4, '0')

  // 返回新編號 (使用當天日期 + 序號)
  return `${year}${month}${day}${nextNumber}`
}
