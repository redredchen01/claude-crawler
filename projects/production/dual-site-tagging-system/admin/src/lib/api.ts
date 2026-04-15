import axios, { AxiosInstance } from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

const client: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

export default client;
