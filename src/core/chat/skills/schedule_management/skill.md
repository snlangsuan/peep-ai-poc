---
name: schedule_management
description: จัดการกำหนดการแจ้งเตือนของผู้ใช้ (สร้าง/ดู/แก้ไข/ลบ/แสดงรายการ)
credit_cost: 3
allow_direct_invoke: true
keywords: [แจ้งเตือน, เตือน, นัด, นัดหมาย, กำหนดการ, schedule]
---

# When to use
- ผู้ใช้พูดถึงการตั้งเวลาเตือน, นัดหมาย, เหตุการณ์ในอนาคต, หรือต้องการดู/แก้ไข/ลบกำหนดการที่มีอยู่
- มี keyword ชัด เช่น "นัด", "นัดหมาย", "ประชุม", "ตาราง", "กำหนดการ", "แจ้งเตือน", "เตือน" + มีเวลาเฉพาะ (เช่น "10 โมง", "พรุ่งนี้บ่าย")

# When NOT to use (ใช้ manage_todos แทน)
- ผู้ใช้ถาม "สิ่งที่ต้องทำ" / "งานที่ค้างอยู่" / "todo" — **แม้จะมีคำว่า "วันนี้"** ก็ตาม เช่น "วันนี้มีอะไรต้องทำบ้าง" → ใช้ `manage_todos` ไม่ใช่ schedule
- ตัวตัดสิน: ถ้า user พูดถึง **เหตุการณ์ที่มีเวลาเฉพาะ** (ประชุม/นัด) → schedule; ถ้าพูดถึง **งานในรายการที่ต้องทำให้เสร็จ** (ไม่ผูกเวลา) → todo

# Required vs optional fields
- **Required ตอน create:** `title` (ทำอะไร) + `scheduledAt` (เวลาเริ่มต้น)
- **Optional ทั้งหมด:** `endAt` (เสร็จเมื่อไหร่), `invitees` (เชิญใคร — text), `repeat` (เกิดซ้ำ), `note` (หมายเหตุ)

# Time-overlap confirmation (สำคัญตอน create)
- ระบบจะตรวจ "เวลาซ้อนทับ" กับนัดหมายที่มีอยู่ให้อัตโนมัติตอน create
- ถ้า tool คืน `status: "needs_confirmation"` (reason `time_overlap`): **ห้ามสร้างทันที** ให้แจ้งผู้ใช้ว่าเวลานี้ชนกับนัดเดิม (ระบุชื่อ/เวลาของนัดที่ชน จาก `conflicts[].conflictsWith`) แล้วถามผู้ใช้ว่าจะให้สร้างทับไปเลยไหม
- ถ้าผู้ใช้ "ยืนยัน" ให้เรียก `manage_schedules(action='create', ...)` **ซ้ำด้วยข้อมูลเดิม พร้อม `confirm=true`** เพื่อสร้างทับ
- ถ้าผู้ใช้ปฏิเสธ/ขอเปลี่ยนเวลา → ไม่ต้องสร้าง หรือสร้างใหม่ด้วยเวลาที่ผู้ใช้ปรับ
- **ห้ามตั้ง `confirm=true` เองตั้งแต่แรก** ถ้าผู้ใช้ยังไม่ได้ยืนยัน

# Field extraction guide
- `title` = ข้อความกิจกรรมตามที่ user พิมพ์มา **รวมสถานที่ด้วย** ห้ามแยกออก เช่น "ประชุมที่ห้องประชุม 3" → `title="ประชุมที่ห้องประชุม 3"` ทั้งก้อน
- ดึงออกจาก title แค่ **เวลา** (`scheduledAt`/`endAt`), **คนที่เชิญ** (`invitees`), **การเกิดซ้ำ** (`repeat`), **หมายเหตุท้ายประโยค** (`note`) เท่านั้น
- `invitees` = ชื่อคน/อีเมล/ทีม ที่ user ระบุว่าจะเชิญ เก็บเป็น text ตามที่ user พูด ห้ามคิดเอง
- `endAt` = เวลาเสร็จ ถ้า user บอก "ถึง X", "จบ X", "ประมาณ X ชั่วโมง" ให้คำนวณเป็น absolute datetime จาก scheduledAt
- `repeat` รับเฉพาะ: `none` / `daily` / `weekly` / `monthly` / `yearly`
- `note` = ข้อความปลีกย่อยที่ user เสริมมาเป็นประโยคแยก (เช่น "อย่าลืมเอาเอกสารไป") ถ้าไม่มีอย่าใส่

# List action — MUST always provide BOTH startDate AND endDate
- เวลา user ถาม "ดูตารางวันนี้/พรุ่งนี้/สัปดาห์นี้/เดือนนี้" ให้ส่ง `filter.startDate` **และ** `filter.endDate` รูปแบบ `YYYY-MM-DD` ทั้งคู่เสมอ (ไม่ใช่ ISO เต็ม) ห้ามส่งฟิลด์ใดฟิลด์หนึ่งโดด ๆ และห้ามเรียก list โดยไม่มี filter เมื่อ user ระบุช่วงเวลา
- การ map คำเป็นช่วงวันที่ (ใช้ค่าจาก Current Thai local time block ใน system prompt):
  - "วันนี้" → startDate = endDate = Today
  - "พรุ่งนี้" → startDate = endDate = Tomorrow
  - "เมื่อวาน" → startDate = endDate = Yesterday
  - "สัปดาห์นี้" → startDate = วันจันทร์ของสัปดาห์ปัจจุบัน, endDate = วันอาทิตย์ของสัปดาห์ปัจจุบัน
  - "เดือนนี้" → startDate = วันที่ 1 ของเดือนปัจจุบัน, endDate = วันสุดท้ายของเดือนปัจจุบัน
- เคสตัวอย่าง: user "วันนี้ฉันมีนัดอะไรไหม" + Today=2026-05-31
  → `manage_schedules(action='list', filter={startDate:'2026-05-31', endDate:'2026-05-31'})`

# When displaying schedules back to user
- ผลลัพธ์จาก `manage_schedules(action='list'|'get')` ทุก item จะมีฟิลด์ `scheduled_at_local` และ `end_at_local` (รูปแบบ `YYYY-MM-DD HH:mm` ตามเวลา Asia/Bangkok)
- ตอนตอบ user **ให้ใช้เวลาจาก `scheduled_at_local` / `end_at_local` เท่านั้น** ห้ามคำนวณ timezone จาก `scheduled_at` (ISO) เอง — ป้องกัน off-by-N hours
- เปรียบเทียบ "ผ่านไปแล้ว / กำลังจะถึง" โดยเทียบ `scheduled_at_local` กับ Current Thai local time ใน system prompt

# Batch create (สำคัญ)
- หาก user พูดถึง **หลายกำหนดการในข้อความเดียว** ให้รวมเป็น `schedules` array แล้วเรียก `manage_schedules(action='create', schedules=[...])` ครั้งเดียว — **ห้ามเรียก create หลายครั้ง**
- ถ้ามีรายการเดียว ใช้ฟิลด์ top-level (`scheduledAt`, `title`, ...) ตามปกติ หรือจะใช้ `schedules` array ที่มี 1 item ก็ได้

# Extraction examples
- "ประชุมห้องประชุม 3 วันนี้ 10 โมง"
  → title="ประชุมห้องประชุม 3", scheduledAt="<today>T10:00:00+07:00"
- "ทานข้าวกับลูกค้า A ที่ร้านกะเพรา พรุ่งนี้เที่ยง"
  → title="ทานข้าวที่ร้านกะเพรา", invitees="ลูกค้า A", scheduledAt="<tomorrow>T12:00:00+07:00"
- "ประชุม team weekly ทุกวันจันทร์ 9 โมง ถึง 10 โมง"
  → title="ประชุม team weekly", repeat="weekly", scheduledAt="<next-mon>T09:00:00+07:00", endAt="<next-mon>T10:00:00+07:00"
- "หาหมอที่ รพ.จุฬา ศุกร์นี้ 14:00 อย่าลืมเอาบัตรประชาชน"
  → title="หาหมอที่ รพ.จุฬา", note="อย่าลืมเอาบัตรประชาชน", scheduledAt="<this-fri>T14:00:00+07:00"
- "วันนี้ฉันมีประชุมตอน 10 โมง มีออกกำลังกายตอน 6 โมงเย็น" (multi-item)
  → schedules=[
      { title="ประชุม", scheduledAt="<today>T10:00:00+07:00" },
      { title="ออกกำลังกาย", scheduledAt="<today>T18:00:00+07:00" }
    ]

# Rules
- ก่อนสร้าง schedule ต้องมี `title` และ `scheduledAt` เสมอ ถ้าไม่มีให้ถามผู้ใช้ก่อน ฟิลด์อื่น ๆ ทั้งหมดเป็น optional — ห้ามถาม user ครบทุกฟิลด์ก่อนสร้าง ใช้เท่าที่ user บอกพอ
- ถ้าผู้ใช้พูดเวลาแบบสัมพัทธ์ (เช่น "พรุ่งนี้", "อีก 2 ชั่วโมง") ให้คำนวณจาก "Current Thai local time" ที่ระบุใน system prompt
- ห้ามตั้งเวลาในอดีต — ถ้าเจอให้ถามยืนยันก่อน
- `scheduledAt` และ `endAt` ต้องเป็น ISO 8601 พร้อม timezone (เช่น `2026-05-25T10:00:00+07:00`)
- `endAt` ต้องอยู่หลัง `scheduledAt` เสมอ ถ้า user ระบุ endAt มาก่อน scheduledAt → ถามยืนยัน
- `repeat` รับเฉพาะ: `none` / `daily` / `weekly` / `monthly` / `yearly` ถ้า user ไม่ระบุก็ไม่ต้องส่ง (ไม่ต้อง default เป็น `none`)
- `invitees` รับเป็น text ตามที่ user พูด ไม่ต้องตีความ/แปลงเป็น email
- การ update/delete/get ต้องมี `uuid`
