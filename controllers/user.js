import User from '../models/user.js'
import mongoose from 'mongoose'
import { StatusCodes } from 'http-status-codes'
import { OAuth2Client } from 'google-auth-library'
import jwt from 'jsonwebtoken'
import validator from 'validator'
import AuditLog from '../models/auditLog.js'
import { getNextUserNumber } from '../utils/sequence.js'
import Company from '../models/company.js' // 新增
import { roleNames } from '../enums/UserRole.js'
import Department from '../models/department.js' // 新增
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import nodemailer from 'nodemailer'
import { fileURLToPath } from 'url'
import path, { dirname } from 'path'
import { v2 as cloudinary } from 'cloudinary'

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
})

export const create = async (req, res) => {
  try {
    // 先查詢部門資訊
    const departmentData = await Department.findById(req.body.department)
    if (!departmentData) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: '找不到選定的部門'
      })
    }

    // 使用部門編號生成員工編號
    const userId = await getNextUserNumber(departmentData.departmentId)

    // 從請求中提取公司 ID 和其他資訊
    const { company, department } = req.body
    const companyData = await Company.findById(company)

    if (!companyData) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: '找不到選定的公司'
      })
    }

    const randomPassword = crypto.randomBytes(8).toString('hex')

    const result = await User.create({
      ...req.body,
      userId,
      company,
      department,
      password: randomPassword,
      isFirstLogin: true
    })

    // 更完整的變更記錄
    const changes = {
      name: {
        from: null,
        to: result.name
      },
      userId: {
        from: null,
        to: result.userId
      },
      email: {
        from: null,
        to: result.email
      },
      personalEmail: {
        from: null,
        to: result.personalEmail
      },
      gender: {
        from: null,
        to: result.gender
      },
      IDNumber: {
        from: null,
        to: result.IDNumber
      },
      company: {
        from: null,
        to: companyData.name
      },
      department: {
        from: null,
        to: departmentData.name
      },
      role: {
        from: null,
        to: roleNames[result.role]
      },
      employmentStatus: {
        from: null,
        to: result.employmentStatus
      },
      salary: {
        from: null,
        to: result.salary
      },
      cowellAccount: {
        from: null,
        to: result.cowellAccount
      },
      cowellPassword: {
        from: null,
        to: result.cowellPassword
      },
      englishName: {
        from: null,
        to: result.englishName
      },
      permanentAddress: {
        from: null,
        to: result.permanentAddress
      },
      contactAddress: {
        from: null,
        to: result.contactAddress
      },
      emergencyName: {
        from: null,
        to: result.emergencyName
      },
      emergencyCellphone: {
        from: null,
        to: result.emergencyCellphone
      },
      emergencyRelationship: {
        from: null,
        to: result.emergencyRelationship
      },
      hireDate: {
        from: null,
        to: result.hireDate
      }
    }

    // 添加可選欄位
    if (result.jobTitle) {
      changes.jobTitle = {
        from: null,
        to: result.jobTitle
      }
    }
    if (result.cellphone) {
      changes.cellphone = {
        from: null,
        to: result.cellphone
      }
    }
    if (result.extNumber) {
      changes.extNumber = {
        from: null,
        to: result.extNumber
      }
    }
    if (result.birthDate) {
      changes.birthDate = {
        from: null,
        to: result.birthDate
      }
    }
    if (result.printNumber) {
      changes.printNumber = {
        from: null,
        to: result.printNumber
      }
    }
    if (result.guideLicense !== undefined) {
      changes.guideLicense = {
        from: null,
        to: result.guideLicense
      }
    }

    await AuditLog.create({
      operatorId: req.user._id,
      operatorInfo: {
        name: req.user.name,
        userId: req.user.userId
      },
      action: '創建',
      targetId: result._id,
      targetInfo: {
        name: result.name,
        userId: result.userId,
        departmentId: departmentData.departmentId,
        companyId: companyData.companyId
      },
      targetModel: 'users',
      changes
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '用戶創建成功',
      result: {
        ...result.toObject(),
        password: undefined
      }
    })
  } catch (error) {
    console.error('Create user error:', error)
    if (error.name === 'ValidationError') {
      const key = Object.keys(error.errors)[0]
      const message = error.errors[key].message
      res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message
      })
    } else if (error.name === 'MongoServerError' && error.code === 11000) {
      let message = ''
      if (error.keyValue.email) {
        message = 'Email已註冊'
      } else if (error.keyValue.IDNumber) {
        message = '身分證號碼已註冊'
      } else if (error.keyValue.cellphone) {
        message = '手機號碼已註冊'
      } else if (error.keyValue.extNumber) {
        message = '分機號碼已註冊'
      } else if (error.keyValue.printNumber) {
        message = '列印編號已註冊'
      } else if (error.keyValue.userId) {
        message = '員工編號已註冊'
      } else if (error.keyValue.cowellAccount) {
        message = '科威帳號已註冊'
      } else {
        message = '某些欄位值已註冊'
      }
      res.status(StatusCodes.CONFLICT).json({
        success: false,
        message
      })
    } else {
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: '未知錯誤'
      })
    }
  }
}
// 用戶登入

export const login = async (req, res) => {
  try {
    if (req.user.employmentStatus !== '在職') {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: '此帳號已停用，如有疑問請聯絡人資部門'
      })
    }

    // 先 populate user 对象
    const populatedUser = await User.findById(req.user._id)
      .populate('company', 'name') // 现有的 populate
      .populate('department', 'name departmentId') // 添加 department populate

    const token = jwt.sign({ _id: populatedUser._id }, process.env.JWT_SECRET, { expiresIn: '10h' })
    populatedUser.tokens.push(token)
    await populatedUser.save()

    if (populatedUser.isFirstLogin) {
      return res.status(StatusCodes.OK).json({
        success: true,
        message: '首次登入,請修改密碼',
        result: {
          token,
          isFirstLogin: true
        }
      })
    }
    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: {
        token,
        name: populatedUser.name,
        englishName: populatedUser.englishName,
        birthDate: populatedUser.birthDate,
        gender: populatedUser.gender,
        cellphone: populatedUser.cellphone,
        email: populatedUser.email,
        personalEmail: populatedUser.personalEmail,
        permanentAddress: populatedUser.permanentAddress,
        contactAddress: populatedUser.contactAddress,
        emergencyName: populatedUser.emergencyName,
        emergencyCellphone: populatedUser.emergencyCellphone,
        userId: populatedUser.userId,
        company: populatedUser.company,
        department: populatedUser.department, // 现在会包含完整的部门信息
        hireDate: populatedUser.hireDate,
        extNumber: populatedUser.extNumber,
        printNumber: populatedUser.printNumber,
        guideLicense: populatedUser.guideLicense,
        role: populatedUser.role,
        jobTitle: populatedUser.jobTitle,
        avatar: populatedUser.avatar,
        cowellAccount: populatedUser.cowellAccount,
        cowellPassword: populatedUser.cowellPassword
      }
    })
  } catch (error) {
    console.error(error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '未知錯誤'
    })
  }
}

const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'postmessage'
)
// Google 驗證回調
export const googleLogin = async (req, res) => {
  try {
    const { code } = req.body
    const { tokens } = await oauth2Client.getToken(code)
    const idToken = tokens.id_token
    const ticket = await oauth2Client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    })

    const payload = ticket.getPayload()
    const email = payload.email

    // 修改这里：同时 populate company 和 department
    const user = await User.findOne({ email })
      .populate('company', 'name')
      .populate('department', 'name departmentId')

    if (!user) {
      return res.status(401).json({
        success: false,
        message: '此Email尚未註冊,請聯絡人資部門'
      })
    }

    if (user.isFirstLogin) {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: '您是初次登入用戶，請使用初始密碼登入系統'
      })
    }

    if (user.employmentStatus !== '在職') {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: '此帳號已停用，如有疑問請聯絡人資部門'
      })
    }

    const jwtToken = jwt.sign({ _id: user._id }, process.env.JWT_SECRET, {
      expiresIn: '10h'
    })

    user.tokens.push(jwtToken)
    await user.save()

    res.status(200).json({
      success: true,
      message: '登入成功',
      result: {
        token: jwtToken,
        name: user.name,
        englishName: user.englishName,
        birthDate: user.birthDate,
        gender: user.gender,
        cellphone: user.cellphone,
        email: user.email,
        personalEmail: user.personalEmail,
        permanentAddress: user.permanentAddress,
        contactAddress: user.contactAddress,
        emergencyName: user.emergencyName,
        emergencyCellphone: user.emergencyCellphone,
        userId: user.userId,
        company: user.company,
        department: user.department, // 现在会包含完整的部门信息
        hireDate: user.hireDate,
        extNumber: user.extNumber,
        printNumber: user.printNumber,
        guideLicense: user.guideLicense,
        role: user.role,
        jobTitle: user.jobTitle,
        avatar: user.avatar,
        cowellAccount: user.cowellAccount,
        cowellPassword: user.cowellPassword
      }
    })
  } catch (error) {
    console.error('Google驗證錯誤:', error)
    res.status(500).json({
      success: false,
      message: 'Google驗證失敗',
      error: error.message
    })
  }
}

// 延長用戶登入 token
// export const extend = async (req, res) => {
//   try {
//     // 添加檢查用戶狀態
//     if (req.user.employmentStatus !== '在職') {
//       return res.status(StatusCodes.FORBIDDEN).json({
//         success: false,
//         message: '此帳號已停用，如有疑問請聯絡人資部門'
//       })
//     }

//     const idx = req.user.tokens.findIndex(token => token === req.token)
//     const token = jwt.sign({ _id: req.user._id }, process.env.JWT_SECRET, { expiresIn: '1m' })
//     req.user.tokens[idx] = token
//     await req.user.save()
//     res.status(StatusCodes.OK).json({
//       success: true,
//       message: '',
//       result: token
//     })
//   } catch (error) {
//     handleError(res, error)
//   }
// }

// 取得當前用戶資料
export const profile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('company', 'name') // populate 公司資訊
      .populate('department', 'name companyId') // populate 部門資訊

    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: {
        email: user.email,
        personalEmail: user.personalEmail,
        IDNumber: user.IDNumber,
        gender: user.gender,
        name: user.name,
        englishName: user.englishName,
        cellphone: user.cellphone,
        salary: user.salary,
        extNumber: user.extNumber,
        birthDate: user.birthDate,
        permanentAddress: user.permanentAddress,
        contactAddress: user.contactAddress,
        department: user.department,
        company: user.company,
        jobTitle: user.jobTitle,
        role: user.role,
        userId: user.userId,
        hireDate: user.hireDate,
        emergencyName: user.emergencyName,
        emergencyCellphone: user.emergencyCellphone,
        printNumber: user.printNumber,
        guideLicense: user.guideLicense,
        avatar: user.avatar,
        cowellAccount: user.cowellAccount,
        cowellPassword: user.cowellPassword
      }
    })
  } catch (error) {
    handleError(res, error)
  }
}

// // 新增一個日期處理的輔助函數
// const getDateRange = (dateType, startDate, endDate) => {
//   const start = new Date(startDate)
//   const end = new Date(endDate)
//   start.setHours(0, 0, 0, 0)
//   end.setHours(23, 59, 59, 999)

//   switch (dateType) {
//     case 'hireDate':
//       return {
//         hireDate: {
//           $gte: start,
//           $lte: end
//         }
//       }
//     case 'resignationDate':
//       return {
//         resignationDate: {
//           $gte: start,
//           $lte: end
//         }
//       }
//     case 'birthDate':
//       return {
//         $and: [
//           {
//             birthDate: {
//               $exists: true
//             }
//           },
//           {
//             $expr: {
//               $or: [
//                 // 考慮同年的情況
//                 {
//                   $and: [
//                     { $eq: [{ $year: '$birthDate' }, start.getFullYear()] },
//                     { $gte: [{ $dayOfYear: '$birthDate' }, { $dayOfYear: start }] },
//                     { $lte: [{ $dayOfYear: '$birthDate' }, { $dayOfYear: end }] }
//                   ]
//                 },
//                 // 考慮跨年的情況
//                 {
//                   $or: [
//                     { $gte: [{ $dayOfYear: '$birthDate' }, { $dayOfYear: start }] },
//                     { $lte: [{ $dayOfYear: '$birthDate' }, { $dayOfYear: end }] }
//                   ]
//                 }
//               ]
//             }
//           }
//         ]
//       }
//     default:
//       return {}
//   }
// }

// 取得所有用戶資料（包含分頁與排序）
export const getAll = async (req, res) => {
  try {
    const itemsPerPage = req.query.itemsPerPage * 1 || 10
    const page = parseInt(req.query.page) || 1
    const query = {}

    // // 保留原有的生日查詢邏輯，因為它與 search 函式中的處理不同
    // if (req.query.dateType === 'birthDate' && req.query.birthDateStart && req.query.birthDateEnd) {
    //   const startDate = new Date(req.query.birthDateStart)
    //   const endDate = new Date(req.query.birthDateEnd)
    //   const startMonth = startDate.getMonth() + 1
    //   const startDay = startDate.getDate()
    //   const endMonth = endDate.getMonth() + 1
    //   const endDay = endDate.getDate()

    //   query.$expr = {
    //     $let: {
    //       vars: {
    //         birthMonth: { $month: '$birthDate' },
    //         birthDay: { $dayOfMonth: '$birthDate' }
    //       },
    //       in: {
    //         $or: [
    //           {
    //             $and: [
    //               { $eq: ['$$birthMonth', startMonth] },
    //               { $gte: ['$$birthDay', startDay] }
    //             ]
    //           },
    //           {
    //             $and: [
    //               { $gt: ['$$birthMonth', startMonth] },
    //               { $lt: ['$$birthMonth', endMonth] }
    //             ]
    //           },
    //           {
    //             $and: [
    //               { $eq: ['$$birthMonth', endMonth] },
    //               { $lte: ['$$birthDay', endDay] }
    //             ]
    //           }
    //         ]
    //       }
    //     }
    //   }
    // }

    // 處理其他查詢條件，保持原有邏輯
    if (req.query.role !== undefined && req.query.role !== '') {
      query.role = Number(req.query.role)
    }

    if (req.query.companyId) {
      query.company = new mongoose.Types.ObjectId(req.query.companyId)
    }

    if (req.query.departmentId) {
      query.department = new mongoose.Types.ObjectId(req.query.departmentId)
    }

    if (req.query.gender) {
      query.gender = req.query.gender
    }

    if (req.query.guideLicense !== undefined) {
      query.guideLicense = req.query.guideLicense === 'true'
    }

    if (req.query.employmentStatus) {
      query.employmentStatus = req.query.employmentStatus
    }

    console.log('Final query:', JSON.stringify(query, null, 2))

    const result = await User.find(query)
      .populate('company', 'name companyId')
      .populate('department', 'name departmentId')
      .sort({ [req.query.sortBy || 'userId']: req.query.sortOrder === 'desc' ? -1 : 1 })
      .skip((page - 1) * itemsPerPage)
      .limit(itemsPerPage)

    const total = await User.countDocuments(query)

    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: {
        data: result,
        totalItems: total,
        itemsPerPage,
        currentPage: page
      }
    })
  } catch (error) {
    console.error('Get users error:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '獲取用戶列表時發生錯誤',
      error: error.message
    })
  }
}
export const getSuggestions = async (req, res) => {
  try {
    const search = req.query.search || ''

    // 構建搜索條件
    const searchRegex = new RegExp(search, 'i')
    const query = {
      $or: [
        { name: searchRegex },
        { userId: searchRegex },
        { email: searchRegex }
      ]
    }

    // 限制返回數量並只返回必要欄位
    const users = await User.find(query)
      .select('name userId email')
      .limit(10)

    res.status(StatusCodes.OK).json({
      success: true,
      result: users
    })
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '獲取用戶建議失敗',
      error: error.message
    })
  }
}

export const getEmployeeStats = async (req, res) => {
  try {
    // 使用 aggregation pipeline 來獲取所有在職員工的公司分佈
    const companyStats = await User.aggregate([
      {
        $match: {
          employmentStatus: '在職'
        }
      },
      {
        // 關聯 companies 集合
        $lookup: {
          from: 'companies',
          localField: 'company',
          foreignField: '_id',
          as: 'companyInfo'
        }
      },
      {
        // 解構關聯後的陣列
        $unwind: {
          path: '$companyInfo',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        // 按公司分組並計數
        $group: {
          _id: '$company',
          count: { $sum: 1 },
          companyName: { $first: '$companyInfo.name' }
        }
      }
    ])

    // 計算總在職人數
    const totalActive = companyStats.reduce((sum, company) => sum + company.count, 0)

    // 格式化響應數據
    const stats = {
      total: totalActive,
      companies: companyStats.map(stat => ({
        companyId: stat._id,
        companyName: stat.companyName || '未分類',
        count: stat.count
      }))
    }

    res.status(StatusCodes.OK).json({
      success: true,
      result: stats
    })
  } catch (error) {
    console.error('Error getting employee stats:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '獲取員工統計資料失敗',
      error: error.message
    })
  }
}

export const searchByDateRange = async (req, res) => {
  try {
    const {
      dateType,
      startDate,
      endDate,
      page = 1,
      itemsPerPage = 10,
      sortBy = 'userId',
      sortOrder = 'asc',
      companyId,
      departmentId,
      employmentStatus
    } = req.query

    if (!dateType || !startDate || !endDate) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '缺少必要的日期參數'
      })
    }

    const query = {}
    const start = new Date(startDate)
    const end = new Date(endDate)

    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)

    // 在 switch 外部先定義變量
    let startMonth, startDay, endMonth, endDay

    // 根據不同的日期類型設置查詢條件
    switch (dateType) {
      case 'hireDate': {
        query.hireDate = { $gte: start, $lte: end }
        break
      }
      case 'resignationDate': {
        query.resignationDate = { $gte: start, $lte: end }
        break
      }
      case 'birthDate': {
        startMonth = start.getMonth() + 1
        startDay = start.getDate()
        endMonth = end.getMonth() + 1
        endDay = end.getDate()

        query.$expr = {
          $let: {
            vars: {
              birthMonth: { $month: '$birthDate' },
              birthDay: { $dayOfMonth: '$birthDate' }
            },
            in: {
              $or: [
                {
                  $and: [
                    { $eq: ['$$birthMonth', startMonth] },
                    { $gte: ['$$birthDay', startDay] }
                  ]
                },
                {
                  $and: [
                    { $gt: ['$$birthMonth', startMonth] },
                    { $lt: ['$$birthMonth', endMonth] }
                  ]
                },
                {
                  $and: [
                    { $eq: ['$$birthMonth', endMonth] },
                    { $lte: ['$$birthDay', endDay] }
                  ]
                }
              ]
            }
          }
        }
        break
      }
      default: {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: '無效的日期類型'
        })
      }
    }

    // 添加其他篩選條件
    if (companyId) {
      query.company = new mongoose.Types.ObjectId(companyId)
    }
    if (departmentId) {
      query.department = new mongoose.Types.ObjectId(departmentId)
    }
    if (employmentStatus) {
      query.employmentStatus = employmentStatus
    }

    console.log('Date search query:', JSON.stringify(query, null, 2))

    const [result, total] = await Promise.all([
      User.find(query)
        .populate('company', 'name companyId')
        .populate('department', 'name departmentId')
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .skip((page - 1) * itemsPerPage)
        .limit(itemsPerPage),
      User.countDocuments(query)
    ])

    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: {
        data: result,
        totalItems: total,
        itemsPerPage: Number(itemsPerPage),
        currentPage: Number(page)
      }
    })
  } catch (error) {
    console.error('Date search error:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '日期搜尋失敗',
      error: error.message
    })
  }
}

// 用戶登出
export const logout = async (req, res) => {
  try {
    req.user.tokens = req.user.tokens.filter(token => token !== req.token)
    await req.user.save()

    res.status(StatusCodes.OK).json({
      success: true,
      message: '登出成功'
    })
  } catch (error) {
    handleError(res, error)
  }
}

export const remove = async (req, res) => {
  try {
    if (!validator.isMongoId(req.params.id)) throw new Error('ID')

    const user = await User.findById(req.params.id).populate('department')
    if (!user) {
      throw new Error('NOT FOUND')
    }

    // 刪除用戶
    await user.deleteOne()

    // 記錄刪除操作
    await AuditLog.create({
      operatorId: req.user._id,
      operatorInfo: {
        name: req.user.name,
        userId: req.user.userId
      },
      action: '刪除',
      targetId: user._id,
      targetInfo: {
        name: user.name,
        userId: user.userId
      },
      targetModel: 'users',
      changes: {
        name: {
          from: user.name,
          to: null
        },
        userId: {
          from: user.userId,
          to: null
        },
        email: {
          from: user.email,
          to: null
        },
        company: {
          from: user.company.name,
          to: null
        },
        employmentStatus: {
          from: user.employmentStatus,
          to: null
        }
      }
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '用戶刪除成功'
    })
  } catch (error) {
    console.error('Delete user error:', error)
    handleError(res, error)
  }
}

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    const user = await User.findById(req.user._id)

    // 添加檢查用戶狀態
    if (user.employmentStatus !== '在職') {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: '此帳號已停用，如有疑問請聯絡人資部門'
      })
    }

    // 如果不是首次登入,驗證當前密碼
    if (!user.isFirstLogin) {
      if (!bcrypt.compareSync(currentPassword, user.password)) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: '當前密碼輸入錯誤'
        })
      }
    }

    // 驗證新密碼長度
    if (newPassword.length < 8) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '新密碼長度至少需要8個字元'
      })
    }

    // 更新密碼
    user.password = newPassword // mongoose pre save hook 會自動進行 hash
    user.isFirstLogin = false // 修改密碼後設為 false
    await user.save()

    // 記錄密碼變更
    await AuditLog.create({
      operatorId: user._id,
      operatorInfo: { // 加入這個
        name: user.name,
        userId: user.userId
      },
      action: '修改',
      targetId: user._id,
      targetInfo: { // 加入這個
        name: user.name,
        userId: user.userId
      },
      targetModel: 'users',
      changes: {
        description: { // 修改格式
          from: '原密碼',
          to: '新密碼'
        }
      }
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '密碼更新成功'
    })
  } catch (error) {
    console.error('Change password error:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '密碼更新失敗'
    })
  }
}

// 編輯用戶資料（僅限管理員）
// 在 user controller 中修改 edit 函數
export const edit = async (req, res) => {
  try {
    if (!validator.isMongoId(req.params.id)) throw new Error('ID')

    // 先獲取原始用戶數據，並展開公司和部門資訊
    const originalUser = await User.findById(req.params.id)
      .populate('company', 'name')
      .populate('department', 'name')
    if (!originalUser) {
      throw new Error('NOT FOUND')
    }

    const updateData = { ...req.body }
    delete updateData.password // 禁止直接更新密碼

    // 創建變更記錄物件
    const auditChanges = {}

    // 處理所有欄位的變更
    const updateFields = [
      'name',
      'email',
      'personalEmail',
      'gender',
      'IDNumber',
      'salary',
      'englishName',
      'permanentAddress',
      'contactAddress',
      'emergencyName',
      'emergencyCellphone',
      'emergencyRelationship',
      'hireDate',
      'birthDate',
      'extNumber',
      'printNumber',
      'guideLicense',
      'cowellAccount',
      'cowellPassword',
      'employmentStatus',
      'jobTitle',
      'cellphone',
      'role'
    ]

    // 比較原始數據和更新數據，記錄變更
    updateFields.forEach(field => {
      const originalValue = originalUser[field] || null
      const updatedValue = updateData[field] || null

      if (originalValue?.toString() !== updatedValue?.toString()) {
        auditChanges[field] = { from: originalValue, to: updatedValue }
      }
    })

    // 處理公司和部門的變更（需要查詢名稱）
    if (updateData.company && updateData.company !== originalUser.company?._id.toString()) {
      const newCompany = await Company.findById(updateData.company)
      auditChanges.company = {
        from: originalUser.company?.name || null,
        to: newCompany?.name || null
      }
    }

    if (updateData.department && updateData.department !== originalUser.department?._id.toString()) {
      const newDepartment = await Department.findById(updateData.department)
      auditChanges.department = {
        from: originalUser.department?.name || null,
        to: newDepartment?.name || null
      }
    }

    // 如果有欄位被更改才更新數據
    if (Object.keys(auditChanges).length > 0) {
      const updatedUser = await User.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      )
        .populate('company', 'name')
        .populate('department', 'name')

      // 記錄變更到 AuditLog
      await AuditLog.create({
        operatorId: req.user._id,
        operatorInfo: {
          name: req.user.name,
          userId: req.user.userId
        },
        action: '修改',
        targetId: updatedUser._id,
        targetInfo: {
          name: updatedUser.name,
          userId: updatedUser.userId
        },
        targetModel: 'users',
        changes: auditChanges
      })

      res.status(StatusCodes.OK).json({
        success: true,
        message: '用戶資料更新成功',
        result: updatedUser
      })
    } else {
      res.status(StatusCodes.OK).json({
        success: true,
        message: '沒有欄位被修改',
        result: originalUser
      })
    }
  } catch (error) {
    console.error(error)

    // 修改錯誤處理部分
    if (error.name === 'ValidationError') {
      const key = Object.keys(error.errors)[0]
      const message = error.errors[key].message
      res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message
      })
    } else if (error.name === 'MongoServerError' && error.code === 11000) {
      let message = ''
      if (error.keyValue.email) {
        message = 'Email已註冊'
      } else if (error.keyValue.IDNumber) {
        message = '身分證號碼已註冊'
      } else if (error.keyValue.cellphone) {
        message = '手機號碼已註冊'
      } else if (error.keyValue.extNumber) {
        message = '分機號碼已註冊'
      } else if (error.keyValue.printNumber) {
        message = '列印編號已註冊'
      } else if (error.keyValue.userId) {
        message = '員工編號已註冊'
      } else if (error.keyValue.cowellAccount) {
        message = '科威帳號已註冊'
      } else {
        message = '某些欄位值已註冊'
      }
      res.status(StatusCodes.CONFLICT).json({
        success: false,
        message
      })
    } else if (error.message === 'ID') {
      res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '用戶 ID 格式錯誤'
      })
    } else if (error.message === 'NOT FOUND') {
      res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '查無用戶'
      })
    } else {
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: '未知錯誤'
      })
    }
  }
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 發送重置密碼郵件
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body
    const user = await User.findOne({ email })

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '此電子郵件未註冊'
      })
    }

    // 加入初次登入判斷
    if (user.isFirstLogin) {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: '您是初次登入用戶，請使用初始密碼登入系統'
      })
    }

    // 檢查用戶狀態
    if (user.employmentStatus !== '在職') {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: '此帳號已停用，如有疑問請聯絡人資部門'
      })
    }

    const currentDate = new Date()

    // 檢查上次發送郵件的時間
    if (user.lastEmailSent) {
      const timeSinceLastEmail = currentDate - user.lastEmailSent
      const fiveMinutes = 5 * 60 * 1000 // 5分鐘轉換為毫秒

      if (timeSinceLastEmail < fiveMinutes) {
        const waitTimeSeconds = Math.ceil((fiveMinutes - timeSinceLastEmail) / 1000)
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: `請等待 ${waitTimeSeconds} 秒後再試`
        })
      }
    }

    // 生成重置 token
    const resetToken = crypto.randomBytes(32).toString('hex')

    // 更新用戶資料
    user.resetPasswordToken = resetToken
    user.resetPasswordExpires = new Date(currentDate.getTime() + (30 * 60 * 1000)) // 30分鐘後過期
    user.lastEmailSent = currentDate // 記錄發送時間

    await user.save()

    const resetUrl = `${process.env.FRONTEND_URL}/#/reset-password/${resetToken}`

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'Ysphere - 永信星球 密碼重置請求',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #333;">密碼重置請求</h2>
          </div>
          
          <div style="background: #f7f7f7; padding: 28px; border-radius: 5px; margin-bottom: 20px;">
            <p style="margin-top: 0; font-size: 14px; font-weight: 600">${user.name} 您好，</p>
            <p style="font-size: 14px; font-weight: 500">我們收到了您的密碼重置請求。請點擊下方連結重置您的密碼：</p>
            <div style="text-align: center; margin: 40px 0;">
              <a href="${resetUrl}" 
                  style="background: #495866; color: white; padding: 12px 24px; 
                        text-decoration: none; letter-spacing:2px; font-size:14px; border-radius: 5px; display: inline-block;">
                重置密碼
              </a>
            </div>
            <p style="color: #666; font-size: 13px;">
              此連結將在30分鐘後失效。<br>
            </p>
            <p style="color: #666; font-size: 13px;">
              如果您沒有請求重置密碼，請忽略此郵件。
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <p>感謝您的使用！</p>
            <p style="color: #666; margin-bottom: 20px;">Ysphere EIP System</p>
            <img src="cid:logo" alt="YSTravel Logo" style="max-width: 150px; height: auto;">
          </div>

          <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
            <p>此為系統自動發送的郵件，請勿直接回覆</p>
          </div>
        </div>
      `,
      attachments: [{
        filename: 'logo.png',
        path: path.join(__dirname, '../public/images/logo_horizontal.png'), // 請確保這個路徑指向你的 logo 圖片
        cid: 'logo' // 這個 ID 需要和 HTML 中的 cid 匹配
      }]
    }

    await transporter.sendMail(mailOptions)

    res.status(StatusCodes.OK).json({
      success: true,
      message: '重置密碼郵件已發送，請檢查您的信箱'
    })
  } catch (error) {
    console.error('忘記密碼錯誤:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '發送重置郵件時發生錯誤'
    })
  }
}
// 重置密碼
// 在 controller 中修改 resetPassword 函數
export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body

    // 使用 lean() 獲取純 JavaScript 物件
    const user = await User.findOne({
      resetPasswordToken: token
    }).lean()

    if (!user || !user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '重置連結無效或已過期'
      })
    }

    // 檢查用戶狀態
    if (user.employmentStatus !== '在職') {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: '此帳號已停用，如有疑問請聯絡人資部門'
      })
    }

    // 驗證新密碼長度
    if (newPassword.length < 8) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '新密碼長度至少需要8個字元'
      })
    }

    // 更新使用者資料
    const updatedUser = await User.findByIdAndUpdate(user._id, {
      $set: {
        password: bcrypt.hashSync(newPassword, 10)
      },
      $unset: {
        resetPasswordToken: 1,
        resetPasswordExpires: 1,
        lastEmailSent: 1
      }
    }, { new: true })

    // 記錄密碼重置
    await AuditLog.create({
      operatorId: updatedUser._id,
      operatorInfo: { // 加入這個
        name: updatedUser.name,
        userId: updatedUser.userId
      },
      action: '修改',
      targetId: updatedUser._id,
      targetInfo: { // 加入這個
        name: updatedUser.name,
        userId: updatedUser.userId
      },
      targetModel: 'users',
      changes: {
        description: { // 修改格式
          from: '舊密碼',
          to: '透過郵件重置的新密碼'
        }
      }
    })

    res.status(StatusCodes.OK).json({
      success: true,
      message: '密碼重置成功，請使用新密碼登入'
    })
  } catch (error) {
    console.error('重置密碼錯誤:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '重置密碼時發生錯誤'
    })
  }
}

// 更新用戶頭像
export const updateAvatar = async (req, res) => {
  try {
    if (!req.file || !req.file.path) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '未提供頭像文件'
      })
    }

    const user = await User.findById(req.user._id)
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到用戶'
      })
    }

    // 如果用戶有舊頭像且不是默認頭像，則刪除
    if (user.avatar && !user.avatar.includes('multiavatar')) {
      // 從 Cloudinary URL 中提取 public_id
      const publicId = user.avatar.split('/').pop().split('.')[0]
      try {
        await cloudinary.uploader.destroy(`avatars/${publicId}`)
      } catch (error) {
        console.error('刪除舊頭像失敗:', error)
        // 即使刪除舊頭像失敗，我們仍然繼續更新新頭像
      }
    }

    user.avatar = req.file.path // 更新用戶的頭像URL
    await user.save()

    res.status(StatusCodes.OK).json({
      success: true,
      message: '頭像更新成功',
      result: user.avatar
    })
  } catch (error) {
    console.error('更新頭像錯誤:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '更新頭像失敗'
    })
  }
}

// 新增發送初始密碼的功能
export const sendInitialPassword = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到該用戶'
      })
    }

    if (!user.isFirstLogin) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '該用戶已完成首次登入'
      })
    }

    // 生成新的隨機密碼
    const randomPassword = crypto.randomBytes(8).toString('hex')
    user.password = randomPassword
    await user.save()

    // 發送郵件
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'Ysphere - 永信星球 系統初始密碼',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #333;">系統初始密碼</h2>
          </div>
          
          <div style="background: #f7f7f7; padding: 28px; border-radius: 5px; margin-bottom: 20px;">
            <p style="margin-top: 0; font-size: 14px; font-weight: 600">${user.name} 您好，</p>
            <p style="font-size: 14px; font-weight: 500">這是您的系統初始密碼：</p>
            <div style="text-align: center; margin: 20px 0;">
              <div style="background: #eee; padding: 12px; border-radius: 4px; font-size: 18px; font-family: monospace;">
                ${randomPassword}
              </div>
            </div>
            <p style="color: #666; font-size: 13px;">
              請使用此密碼進行首次登入，系統會要求您立即修改密碼。
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <p style="color: #666; margin-bottom: 20px;">Ysphere EIP System</p>
            <img src="cid:logo" alt="Ysphere LOGO" style="max-width: 150px; height: auto;">
          </div>

          <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
            <p>此為系統自動發送的郵件，請勿直接回覆</p>
          </div>
        </div>
      `,
      attachments: [{
        filename: 'logo.png',
        path: path.join(__dirname, '../public/images/logo_horizontal.png'), // 請確保這個路徑指向你的 logo 圖片
        cid: 'logo' // 這個 ID 需要和 HTML 中的 cid 匹配
      }]
    }

    await transporter.sendMail(mailOptions)

    res.status(StatusCodes.OK).json({
      success: true,
      message: '初始密碼已發送成功'
    })
  } catch (error) {
    console.error('發送初始密碼錯誤:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '發送初始密碼失敗'
    })
  }
}

export const revealCowell = async (req, res) => {
  try {
    const { password } = req.body

    // 驗證用戶輸入的密碼
    const user = await User.findById(req.user._id)
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到用戶'
      })
    }

    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: '密碼錯誤'
      })
    }

    // 返回科威帳號和密碼
    res.status(StatusCodes.OK).json({
      success: true,
      message: '驗證成功',
      result: {
        cowellAccount: user.cowellAccount,
        cowellPassword: user.cowellPassword
      }
    })
  } catch (error) {
    console.error('Reveal Cowell error:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '無法查看科威帳號和密碼'
    })
  }
}

export const search = async (req, res) => {
  try {
    const itemsPerPage = req.query.itemsPerPage * 1 || 10
    const page = parseInt(req.query.page) || 1
    const query = {}

    // 處理日期查詢
    if (req.query.dateType && req.query.startDate && req.query.endDate) {
      const startDate = new Date(req.query.startDate)
      const endDate = new Date(req.query.endDate)

      // 如果開始日期和結束日期相同，將結束日期設為當天的最後一毫秒
      if (startDate.toDateString() === endDate.toDateString()) {
        endDate.setHours(23, 59, 59, 999)
      }

      if (req.query.dateType === 'hireDate') {
        query.hireDate = { $gte: startDate, $lte: endDate }
      } else if (req.query.dateType === 'resignationDate') {
        query.resignationDate = { $gte: startDate, $lte: endDate }
      }
    }

    // 處理其他查詢條件
    if (req.query.role) {
      query.role = Number(req.query.role)
    }
    if (req.query.companyId) {
      query.company = new mongoose.Types.ObjectId(req.query.companyId)
    }
    if (req.query.department) {
      query.department = new mongoose.Types.ObjectId(req.query.department)
    }
    if (req.query.gender) {
      query.gender = req.query.gender
    }
    if (req.query.guideLicense !== undefined) {
      query.guideLicense = req.query.guideLicense === 'true'
    }
    if (req.query.employmentStatus) {
      query.employmentStatus = req.query.employmentStatus
    }

    // 處理快速搜尋
    if (req.query.quickSearch) {
      const searchRegex = new RegExp(req.query.quickSearch, 'i')
      query.$or = [
        { name: searchRegex },
        { userId: searchRegex },
        { email: searchRegex },
        { cellphone: searchRegex },
        { extNumber: searchRegex },
        { personalEmail: searchRegex }
      ]
    }

    console.log('Final query:', JSON.stringify(query, null, 2))

    const sortField = req.query.sortBy || 'userId'
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1

    const pipeline = [
      { $match: query },
      {
        $lookup: {
          from: 'companies',
          localField: 'company',
          foreignField: '_id',
          as: 'company'
        }
      },
      { $unwind: { path: '$company', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'departments',
          localField: 'department',
          foreignField: '_id',
          as: 'department'
        }
      },
      { $unwind: { path: '$department', preserveNullAndEmptyArrays: true } },
      { $sort: { [sortField]: sortOrder } },
      { $skip: (page - 1) * itemsPerPage },
      { $limit: itemsPerPage }
    ]

    const [result, totalCount] = await Promise.all([
      User.aggregate(pipeline),
      User.countDocuments(query)
    ])

    res.status(StatusCodes.OK).json({
      success: true,
      message: '',
      result: {
        data: result,
        totalItems: totalCount,
        itemsPerPage,
        currentPage: page
      }
    })
  } catch (error) {
    console.error('Search users error:', error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '搜索用户时发生错误',
      error: error.message
    })
  }
}

// 統一錯誤處理
const handleError = (res, error) => {
  console.error('Error details:', error) // 增加錯誤詳細資訊的日誌
  if (error.name === 'ValidationError') {
    const key = Object.keys(error.errors)[0]
    const message = error.errors[key].message
    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message
    })
  } else if (error.name === 'MongoServerError' && error.code === 11000) {
    res.status(StatusCodes.CONFLICT).json({
      success: false,
      message: 'Email、身分證、手機、分機號碼、列印編號或員工編號已註冊'
    })
  } else if (error.message === 'ID') {
    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: '用戶 ID 格式錯誤'
    })
  } else if (error.message === 'NOT FOUND') {
    res.status(StatusCodes.NOT_FOUND).json({
      success: false,
      message: '查無用戶'
    })
  } else {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '未知錯誤'
    })
  }
}
