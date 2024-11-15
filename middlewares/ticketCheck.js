// middlewares/ticketCheck.js
import ServiceTicket from '../models/serviceTicket.js'
import { StatusCodes } from 'http-status-codes'

// 檢查請求所有者
export const checkTicketOwner = async (req, res, next) => {
  try {
    const ticketId = req.params.ticketId || req.params.id // 兼容不同路由中 ticketId 的參數名稱
    const ticket = await ServiceTicket.findById(ticketId)
    if (!ticket) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: '找不到該服務請求'
      })
    }

    if (ticket.requesterId.toString() !== req.user._id.toString()) {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: '您只能編輯自己的服務請求'
      })
    }

    req.ticket = ticket // 設置到 req，供後續中間件使用
    next()
  } catch (error) {
    next(error)
  }
}

// 檢查請求狀態
export const checkTicketStatus = async (req, res, next) => {
  if (req.ticket.status !== '待處理') {
    return res.status(StatusCodes.FORBIDDEN).json({
      success: false,
      message: '只能編輯待處理狀態的服務請求'
    })
  }
  next()
}
