import { useParams } from 'react-router-dom'

export default function GuestFormPage() {
  const { token } = useParams()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-8">
      <h1 className="text-2xl font-bold mb-4">賓客表單</h1>
      <p className="text-gray-500">Token: {token}</p>
      <p className="text-gray-500">RSVP 表單（Phase 5 實作）</p>
    </div>
  )
}
