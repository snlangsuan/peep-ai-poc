# 🚀 Omni Intelligence Backend (peep-ai-poc)

ระบบแบคเอนด์ประสิทธิภาพสูงสำหรับระบบเอเจนต์อัจฉริยะ (AI Agent Platform) พัฒนาขึ้นโดยใช้ **Bun**, **Hono** และสถาปัตยกรรม **Clean Architecture** ร่วมกับระบบคิวแบบเรียลไทม์ (Firebase Queue) และระบบงานตามกำหนดเวลา (Schedule Worker)

---

## 🛠️ Tech Stack & Key Technologies

- **Runtime:** [Bun](https://bun.sh/) เพื่อความเร็วในการรันและการจัดการแพ็กเกจที่รวดเร็ว
- **Web Framework:** [Hono](https://hono.dev/) ร่วมกับ Hono OpenAPI และ Scalar API Reference สำหรับการทำ API Spec แบบอัตโนมัติ
- **Database:** Firebase / Google Cloud
  - **Firestore:** สำหรับเก็บข้อมูลหลัก (Users, Todos, Expenses, Schedules, Chats, User Moods)
  - **Firebase Realtime Database:** สำหรับระบบ Message Queue และการซิงค์ข้อมูลความเร็วสูง
- **AI Engine:** Google Gen AI SDK (`@google/genai`) สำหรับโมเดลตระกูล **Gemini** และ OpenAI SDK สำหรับโมเดลทางเลือก (รองรับการเชื่อมต่อกับ Private LLM ที่รันด้วย **vLLM** ผ่าน OpenAI Compatible API ได้อย่างสมบูรณ์)
- **Scheduler:** [Croner](https://github.com/Hexagon/croner) สำหรับการรันงานเบื้องหลังแบบกำหนดเวลาตาม Cron Expression
- **Validation:** [Zod](https://zod.dev/) สำหรับการตรวจสอบข้อมูลที่รับเข้าและส่งออกของ API แบบ Type-safe
- **Logging:** [Pino](https://github.com/pinojs/pino) สำหรับการเก็บบันทึกข้อมูล (Structured Logging) ที่มีประสิทธิภาพสูง

---

## 📂 Project Structure & Architecture

โครงสร้างของระบบถูกออกแบบตามสถาปัตยกรรม **Clean Architecture** แบ่งโฟลเดอร์ใน `src` ออกตามหน้าที่อย่างชัดเจน:

```ascii
src/
├── app.ts                  # โครงสร้างหลักและคอนฟิกเกอเรชันของ Hono App (CORS, Middlewares)
├── factory.ts              # โหลดและแปลงค่าตัวแปรสภาพแวดล้อม (Environment Variables Validation)
├── server.ts               # จุดเริ่มต้นของ HTTP Server และรัน Background Workers
├── worker.ts               # จุดเริ่มต้นสำหรับ Background Workers แบบแยกโปรเซส
│
├── common/                 # โมดูลที่ใช้ร่วมกันทั้งโครงการ
│   ├── constants/          # ค่าคงที่ (Constants) ต่างๆ
│   ├── exceptions/         # การจัดการข้อผิดพลาด (Custom Exceptions)
│   ├── libs/               # การตั้งค่าไลบรารีภายนอก (Firebase, Logger)
│   ├── schemas/            # Zod Schemas หลัก เช่น envSchema, requestSchema
│   ├── services/           # บริการแชร์ เช่น AI Service, Queue Service, SSE Broker
│   ├── types/              # ไทป์ร่วม (TypeScript interfaces)
│   └── utils/              # ฟังก์ชันช่วยเหลือ เช่น ดึงข้อมูลเวลา (datetime.util)
│
├── core/                   # ระบบประมวลผลเอเจนต์และการทำงานแกนกลาง
│   ├── chat/               # สมองของเอเจนต์ (ChatAgent)
│   │   ├── chat-agent.ts   # คลาสหลักประมวลผลข้อความ, Intent Classification, Loop ประเมิน
│   │   ├── chat-mapper.ts  # แปลงโมเดลข้อมูลระหว่างระบบกับ LLM Providers
│   │   ├── tasks/          # งานเสริมที่ทำก่อน/หลังคุยกับเอเจนต์ (เช่น ตรวจสอบความรู้สึก, บันทึกการใช้)
│   │   └── tools/          # เครื่องมือที่เอเจนต์เรียกใช้ได้ (Expenses, Todos, Search, etc.)
│   └── middlewares/        # มิดเดิลแวร์ เช่น Auth, Error Handler, Logger
│
├── features/               # โมดูลของฟีเจอร์ต่างๆ (Feature Modules)
│   ├── chats/
│   ├── expenses/           # ฟีเจอร์จัดการรายรับ-รายจ่าย (ตัวอย่างระบบ Clean Architecture ครบชุด)
│   │   └── v1/
│   │       ├── expense.controller.ts # คอนโทรลเลอร์ควบคุม Request / Response
│   │       ├── expense.openapi.ts    # กำหนดอินพุต/เอาต์พุต Spec สำหรับ Scalar API Docs
│   │       ├── expense.repository.ts # ทำงานกับ Firestore โดยตรง
│   │       ├── expense.schema.ts     # Zod schemas สำหรับอินพุตของ endpoint
│   │       ├── expense.service.ts    # โค้ดส่วน Business Logic
│   │       ├── expense.type.ts       # ไทป์ของ Expense
│   │       └── __test__/             # เทสเคสเฉพาะฟีเจอร์
│   ├── schedules/
│   ├── todos/
│   └── users/
│
├── infrastructure/         # เครือข่ายการติดต่อสื่อสารภายนอก
│   └── http/
│       ├── openapi/        # การลงทะเบียนและตั้งค่า OpenAPI Spec / Scalar
│       └── routes/         # เส้นทาง API (Routes v1)
│
└── worker/                 # ระบบรันงานพื้นหลังแบบตั้งเวลา
    └── schedule/
        ├── modules/        # ส่วนงานเบื้องหลังแยกตามโมดูล (CheckSchedules, SendMoodToAll)
        └── schedule-worker.ts # ตัวจัดการประสานงานเวลา
```

---

## ⚡ How it Works: Deep Dive

### 1. ระบบประมวลผลเอเจนต์อัจฉริยะ (ChatAgent & Intent Classifier)

หัวใจหลักของการประมวลผลบทสนทนา (อยู่ใน [chat-agent.ts](src/core/chat/chat-agent.ts)) มีกระบวนการดังนี้:

```mermaid
graph TD
    A[รับข้อความจากผู้ใช้] --> B[โหลดประวัติการแชทจาก Firestore]
    B --> C[รัน Intent Classifier LLM แบบเร็ว]
    C --> D{ประเภทของ Intent?}

    D -- direct_tool --> E[รันโมดูลเครื่องมือทันที bypass AI Loop]
    E --> F[สร้างประโยคตอบกลับยืนยันผลลัพธ์เป็นธรรมชาติ Thai]

    D -- general_chat / complex_agent --> G[รัน ReAct Reasoning Loop]
    G --> H{LLM ต้องการเรียกใช้ Tool?}
    H -- Yes --> I[ตรวจสอบ Loop ซ้ำซ้อนและรัน Tool]
    I --> G
    H -- No --> J[ได้ข้อความตอบกลับสุดท้าย]

    F --> K[บันทึกประวัติการแชทลง Firestore & ส่งกลับหาผู้ใช้]
    J --> K
```

- **Fast Intent Classification (การเลือกทิศทางแบบประหยัดทราฟฟิก):** ระบบจะใช้ LLM สรุปเจตนาผู้ใช้ก่อน หากเป็นการสั่งงานทั่วไป (เช่น _"จดค่าข้าวมันไก่ 50 บาท"_ หรือ _"บันทึกสิ่งที่จะทำ"_) ระบบจะสลับไปโหมด **Direct Tool** เพื่อรันเครื่องมือนั้นโดยตรงทันที ไม่ต้องผ่าน ReAct Loop แบบปกติ ทำให้ประหยัดค่า Tokens และลด Latency
- **Reasoning Loop (ReAct):** หากเจตนาเป็นความต้องการที่ซับซ้อน ระบบจะเข้าสู่ Loop ประเมินเครื่องมือ ทำงานซ้ำๆ จนกว่าโมเดลจะได้ข้อสรุปสุดท้าย
- **Tight Loop Prevention (ป้องกันการทำงานวนลูปไม่สิ้นสุด):** ในกรณีที่เครื่องมือเกิดข้อผิดพลาดหรือให้ข้อมูลที่ไม่สามารถทำให้โมเดลสรุปได้ ระบบมีมหาอุดที่คอยตรวจสอบว่าเครื่องมือตัวเดิมที่มีอาร์กิวเมนต์ตัวเดิมถูกเรียกติดต่อกันหรือไม่ หากพบจะหยุดการทำงานทันทีเพื่อป้องกันลูปอินฟินิทและประหยัดงบค่า API

---

### 2. ระบบคิวงานเบื้องหลัง (Realtime Firebase Queue)

(อยู่ใน [queue.service.ts](src/common/services/queue.service.ts))

- **Zero-latency Listeners:** ใช้ฟังก์ชันไลฟ์สตรีมข้อมูล `child_added` ของ Firebase Realtime Database ทำให้ผู้ใช้งานส่งข้อความมาแล้วประมวลผลได้ทันทีโดยไม่ต้องเขียน Polling หรือดีเลย์ใดๆ
- **Distributed Locking / Transaction:** มีกระบวนการทำทรานแซกชันเพื่อเคลมงาน (`rtdb.ref(...).transaction()`) ป้องกันไม่ให้แบคเอนด์หลายเครื่องประมวลผลงานชิ้นเดียวกันซ้ำซ้อน
- **Local Concurrency Controller:** มีการจำกัดจำนวนงานประมวลผลพร้อมกันในตัว (Default เป็น 3 งานต่อหนึ่งประเภทคิว) หากคิวเต็มจะค้างอยู่ในสถานะ Pending ใน DB และถูกประมวลผลต่อเมื่อโปรเซสเดิมทำเสร็จสิ้น
- **Live SSE Streams:** เมื่อข้อความถูกถอดจากคิวและรันโดย ChatAgent ใน [worker.ts](src/worker.ts) ระบบจะพ่นสถานะต่างๆ กลับไปยังผู้ใช้ผ่าน Server-Sent Events (SSE Broker) ทันที (เช่น `thinking`, `calling_tool`, `tool_response`, `done`)

---

### 3. ระบบงานแบบตั้งเวลา (Schedule Worker System)

(อยู่ใน [schedule-worker.ts](src/worker/schedule/schedule-worker.ts))
ระบบประสานงานเบื้องหลังทำงานร่วมกับ Firebase Firestore และควบคุมเวลารันด้วย `croner` ในเขตเวลา `Asia/Bangkok` โดยมี 2 โมดูลสำคัญ:

1.  **CheckSchedulesModule (`check-schedules`):**
    - รันทุกๆ 1 นาที (`* * * * *`)
    - **Reactive In-memory Cache:** มีระบบซิงค์ข้อมูลกับ Firestore โดยตรงผ่าน `onSnapshot` เพื่อแคชเฉพาะตารางเวลาที่ยังไม่ได้ส่ง (`sent_at == null`) ไว้ในแรมของโปรเซส เมื่อรันระบบจะวนลูปเฉพาะข้อมูลในแรม ทำให้มีความรวดเร็วสูงมาก
    - **Pre-Notification (15 mins prior):** หากตารางกิจกรรมเหลือเวลาน้อยกว่า 15 นาที ระบบจะยิงข้อความล่วงหน้าและบันทึกเวลา `before_sent_at`
    - **Due Notification:** หากถึงเวลากิจกรรมระบบจะส่งข้อความแจ้งเตือนทันทีและบันทึกเวลา `sent_at`
2.  **SendMoodToAllModule (`send-mood-to-all`):**
    - รันทุกๆ วันเวลา 18:00 น. (`0 18 * * *`)
    - จะคอยดึงรายชื่อผู้ใช้ทั้งหมดในระบบ และสร้างข้อความประเภท `mood_card` (เก็บในรูปแบบ JSON ของฟิลด์ `message`) ลงในห้องแชทของแต่ละคน เพื่อให้ฝั่งหน้าบ้านเรนเดอร์หน้าการเลือกอารมณ์วันนั้นๆ

---

## 🚀 Local Development Setup

### 1. สิ่งที่ต้องมีก่อนเริ่ม (Prerequisites)

- ต้องติดตั้ง [Bun](https://bun.sh/) ในเครื่องคอมพิวเตอร์ของคุณ

### 2. กำหนดค่าตัวแปรสภาพแวดล้อม (Credentials)

สร้างไฟล์ `.env.local` หรือคัดลอกจาก `.env.dev` และระบุรายละเอียดการเข้าถึง Firebase, Google Gemini API และ OpenAI API:

```env
NODE_ENV=local
HOST=localhost
PORT=8000
BASE_URL=https://localhost:8000
WHITE_LIST_ORIGINS=http://localhost:3000,http://localhost:5173

# Google Cloud Platform & Gen AI credentials
GOOGLE_PROJECT_ID=your-project-id
GOOGLE_LOCATION=us-central1
GOOGLE_AUTH_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_AUTH_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQ..."
GOOGLE_GEMINI_CHAT_MODEL=gemini-3.1-flash-lite
GOOGLE_GEMINI_EXTRACT_MODEL=gemini-2.5-flash-lite
GOOGLE_GENAI_API_KEY=your-api-key

# Firebase Realtime Database URL
FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com/

# Backup LLM / Private LLM Provider (OpenAI Compatible เช่น vLLM)
CHAT_PROVIDER=openai                           # กำหนดเป็น openai เพื่อใช้กับโมเดลภายนอก/vLLM
OPENAI_API_KEY=your-api-key-or-mock-string     # ใส่คีย์สำหรับ authenticate หรือใส่ mock-key หากไม่มีการตรวจสอบ
OPENAI_BASE_URL=http://localhost:8000/v1       # ชี้ไปยัง URL ของ vLLM / Private LLM (ไม่ต้องใส่ถ้าต้องการใช้ OpenAI จริง)
OPENAI_CHAT_MODEL=your-private-model-name      # ระบุชื่อโมเดลที่ต้องการเรียกใช้งานบน vLLM
```

### 3. ติดตั้งโปรโตคอลความปลอดภัย HTTPS (Local SSL)

เนื่องจากระบบพึ่งพาฟังก์ชันการทำงานบางส่วนที่ต้องใช้ความปลอดภัยขั้นสูงในเครื่องของผู้ใช้ การรันเซิร์ฟเวอร์แบบ HTTPS ในช่วงพัฒนาจึงแนะนำ:

1.  ติดตั้งโปรแกรม `mkcert` ผ่าน Homebrew:
    ```sh
    brew install mkcert
    ```
2.  สร้างคีย์ลงในโฟลเดอร์โครงการ:
    ```sh
    mkdir .credentials
    mkcert -key-file .credentials/localhost-key.pem -cert-file .credentials/localhost.pem localhost
    ```

### 4. คำสั่งที่ใช้งานบ่อย (Useful CLI Commands)

- **ติดตั้งโมดูลและไลบรารี:**
  ```sh
  bun install
  ```
- **เริ่มทำงานเซิร์ฟเวอร์และรันบอร์ดคาสต์คิวในโปรเซสเดียวกัน (สำหรับพัฒนา):**
  ```sh
  bun run dev
  ```
- **รันโปรเซสแอปเซิร์ฟเวอร์หลัก (Production):**
  ```sh
  bun run start
  ```
- **รันเฉพาะโปรเซสคิวและตารางงานอย่างเดียว (Worker-Only) ในฝั่งพัฒนา:**
  ```sh
  bun run worker:dev
  ```
- **ดูหน้าเอกสาร API (API Reference Docs):**
  - เปิดบราวเซอร์ไปที่: `http://localhost:8000/poc/docs` หรือ `https://localhost:8000/poc/docs` (ตามโปรโตคอลที่รัน)

---

## 🧪 การเขียนโค้ดต่อเติม (Developer Extension Guide)

### 1. วิธีเพิ่ม Endpoint หรือฟีเจอร์ใหม่

แนะนำให้เดินตามแบบแผนของฟีเจอร์ `expenses` ในโฟลเดอร์ `src/features/expenses/v1/`:

1.  **Define Type/Schema:** เขียนไทป์ใน `expense.type.ts` และ Zod Schema ใน `expense.schema.ts` เพื่อการันตีอินพุต
2.  **Repository:** เขียนคลาสสำหรับดึง/แก้ไขข้อมูลจาก Firestore ลงใน `*.repository.ts`
3.  **Service:** เขียนคลาสสำหรับจัดการ Business Logic ครอบคลุมฟังก์ชันต่างๆ ใน `*.service.ts`
4.  **Controller:** รับ Request, ดึงพารามิเตอร์ที่ผ่าน Validator และเรียก Service ส่งกลับข้อมูลใน `*.controller.ts`
5.  **OpenAPI Spec:** บันทึกโครงสร้าง Route รายการใน `*.openapi.ts`
6.  **Route Setup:** นำมารวบรวมและกำหนด URL ใน `src/infrastructure/http/routes/v1/` และนำไปเชื่อมใน `index.ts`

### 2. วิธีเขียนเครื่องมือให้ AI เรียกใช้เพิ่ม (Adding a new AI Tool)

1.  ไปที่โฟลเดอร์ `src/core/chat/tools/`
2.  สร้างคลาสใหม่ที่อิมพลีเมนต์มาจากอินเตอร์เฟส `IChatTool`
3.  กำหนดชื่อเครื่องมือให้ชัดเจน (`name`), คำอธิบายสำหรับ LLM ว่าควรเรียกใช้ตอนไหน (`description`) และอาร์กิวเมนต์แบบ JSON Schema (`parameters`)
4.  เขียนฟังก์ชัน `execute(args, context)` เพื่อกำหนดตรรกะการรัน
5.  เปิดไฟล์ `src/worker.ts` และทำนำเครื่องมือตัวนี้ไป `.addTool(...)` ต่อท้ายคลาส `ChatAgent`

---

## 🛡️ Testing & Validation

ระบบได้รับการคุ้มครองด้วยการตั้งค่าทดสอบคุณภาพระดับสูง ทุกฟังก์ชันสำคัญควรมีเทสเคสครอบคลุม:

- รันการทดสอบทั้งหมดของระบบ:
  ```sh
  bun test
  ```
- ไฟล์ทดสอบจะอยู่ในโฟลเดอร์ `__test__` เสมอ คลุมครอบกระบวนการตั้งแต่ระดับ Logic, คอนโทรลเลอร์ยัน Flow ของตัว Agent

---

**💡 Tips:** คุณสามารถติดต่อและดูรันล็อกของ Pino ได้แบบสวยงามมีสีสันในช่วงพัฒนาด้วยการรัน `bun run dev` ตัวระบบจะเปิด Pretty Logging เพื่อช่วยให้ดีบักฟลูวคิวและลูปเอเจนต์ได้อย่างราบรื่นที่สุด!
