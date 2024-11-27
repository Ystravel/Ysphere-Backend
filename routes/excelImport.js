// routes/excel.js
import { Router } from 'express'
import multer from 'multer'
import { importExcel } from '../controllers/excelImport.js'
import * as auth from '../middlewares/auth.js'
import checkRole from '../middlewares/checkRole.js'
import UserRole from '../enums/UserRole.js'

const upload = multer({ dest: 'uploads/' })
const router = Router()

// 新增上傳 Excel 的路由
router.post('/import',
  auth.jwt,
  checkRole([UserRole.HR, UserRole.SUPER_ADMIN]),
  upload.single('file'),
  importExcel
)

export default router
