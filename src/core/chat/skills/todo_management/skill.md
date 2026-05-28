---
name: todo_management
description: จัดการรายการสิ่งที่ต้องทำของผู้ใช้ (สร้าง/ดู/แก้ไข/ลบ/ติ๊กเสร็จ/แสดงรายการ)
credit_cost: 3
allow_direct_invoke: true
keywords: [todo, สิ่งที่ต้องทำ, งาน, รายการ, ติ๊ก, เช็คลิสต์]
---

# When to use
- ผู้ใช้ขอจัดการรายการ to-do (เพิ่ม, เสร็จแล้ว, ลบ, ดูทั้งหมด)

# Rules
- ต้องมี `title` ตอนสร้างใหม่
- การ get/update/delete ต้องระบุ `uuid` ของ todo
- `list` รองรับ pagination (page เริ่ม 1, limit ค่า default 10)
