import User from '../models/user.js'
import Department from '../models/department.js'
import ServiceTicket from '../models/serviceTicket.js'
import Company from '../models/company.js'

/**
 * 獲取下一個可用的員工編號
 * @returns {Promise<string>} 格式化的員工編號 (例如: '0014')
 */
export const getNextUserNumber = async () => {
  // 查找所有用戶的 userId，並提取數字部分
  const users = await User.find({}, { userId: 1 })
  const numbers = users
    .map(user => parseInt(user.userId))
    .filter(num => !isNaN(num)) // 過濾掉無效的數字

  // 如果沒有現有用戶，從 1 開始
  if (numbers.length === 0) {
    return '0001'
  }

  // 找到最大的數字
  const maxNumber = Math.max(...numbers)
  // 返回下一個數字
  return String(maxNumber + 1).padStart(4, '0')
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
 * 獲取下一個可用的部門編號
 * 編碼規則: 依公司編號 + 部門流水號 (01-99)
 * 例如: A101, A102 ... A199, B101 ...
 * @param {string} companyId - 公司編號
 * @returns {Promise<string>} 格式化的部門編號
 */
export const getNextDepartmentNumber = async (companyId) => {
  // 查找特定公司的所有部門編號
  const departments = await Department.find({ companyId }, { departmentId: 1 })

  // 提取部門流水號（最後兩位數字）
  const numbers = departments
    .map((dept) => {
      const match = dept.departmentId.match(/\d{2}$/)
      return match ? parseInt(match[0]) : 0
    })
    .filter((num) => !isNaN(num))

  // 如果沒有部門，從 01 開始
  if (numbers.length === 0) {
    return `${companyId}01`
  }

  // 找到最大的流水號
  const maxNumber = Math.max(...numbers)

  if (maxNumber >= 99) {
    throw new Error(`公司 ${companyId} 的部門數量已達最大限制`)
  }

  // 返回下一個流水號，格式為 "公司ID + 兩位數流水號"
  return `${companyId}${String(maxNumber + 1).padStart(2, '0')}`
}

/**
 * 獲取下一個可用的服務請求編號
 * @returns {Promise<string>} 格式化的服務請求編號 (例如: 'IT24110001')
 */
export const getNextTicketNumber = async () => {
  const today = new Date()
  const year = today.getFullYear().toString().slice(-2) // 只取年份後兩位
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
