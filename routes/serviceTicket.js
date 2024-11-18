// routes/serviceTicket.js
import { Router } from 'express'
import {
  create,
  getAll,
  getOne,
  update,
  uploadImages,
  deleteImage,
  deleteTicket,
  getStats,
  getMyTickets,
  userUpdate,
  getAvailableAssignees
} from '../controllers/serviceTicket.js'
import * as auth from '../middlewares/auth.js'
import { checkTicketOwner, checkTicketStatus } from '../middlewares/ticketCheck.js'
import ticketUpload from '../middlewares/ticketUpload.js'
import UserRole from '../enums/UserRole.js'
import checkRole from '../middlewares/checkRole.js'

const router = Router()

// 基本路由
router.post('/',
  auth.jwt,
  ticketUpload,
  create
)

// 個人維修請求路由
router.get('/my-tickets',
  auth.jwt,
  getMyTickets
)

// 統計資料路由 (僅限 IT/ADMIN/SUPER_ADMIN)
router.get('/stats',
  auth.jwt,
  checkRole([UserRole.IT, UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  getStats
)

// (新增) 獲取可用處理者清單 (僅限 IT/ADMIN/SUPER_ADMIN)
router.get('/assignees',
  auth.jwt,
  checkRole([UserRole.IT, UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  getAvailableAssignees
)

// 獲取所有維修請求 (僅限 IT/ADMIN/SUPER_ADMIN)
router.get('/all',
  auth.jwt,
  checkRole([UserRole.IT, UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  getAll
)

// ID 相關路由
router.get('/:id',
  auth.jwt,
  checkTicketOwner,
  getOne
)

// 編輯維修請求
router.patch('/:id/edit', // 改用 id 作為參數名
  auth.jwt,
  checkTicketOwner,
  checkTicketStatus,
  userUpdate
)

// IT人員更新維修請求狀態 (僅限 IT/ADMIN/SUPER_ADMIN)
router.patch('/:id',
  auth.jwt,
  checkRole([UserRole.IT, UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  update
)

// 圖片操作路由
router.post('/:id/images',
  auth.jwt,
  checkTicketOwner,
  checkTicketStatus,
  ticketUpload,
  uploadImages
)

router.delete('/:ticketId/images/:publicId',
  auth.jwt,
  checkTicketOwner,
  checkTicketStatus,
  deleteImage
)

// 刪除維修請求
router.delete('/:id',
  auth.jwt,
  checkTicketOwner,
  deleteTicket
)

export default router
