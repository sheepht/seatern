import axios from 'axios'

export const publicApi = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})
