require("@anthropic-ai/sdk/shims/node");
require("@testing-library/jest-dom");

// Mock environment variables
process.env.ANTHROPIC_API_KEY = "test-key";
process.env.DATABASE_URL = "file:./prisma/dev.db";

// Mock global fetch for Node environment
if (typeof global.fetch === "undefined") {
  global.fetch = jest.fn();
}

// Mock Next.js server API types
if (typeof global.Request === "undefined") {
  global.Request = class Request {
    constructor(input, init) {
      this.url = input;
      this.init = init;
    }

    async json() {
      return {};
    }

    async text() {
      return "";
    }
  };
}

if (typeof global.Response === "undefined") {
  global.Response = class Response {
    constructor(body, init) {
      this.body = body;
      this.status = init?.status || 200;
      this.init = init;
    }

    async json() {
      return JSON.parse(this.body);
    }

    async text() {
      return this.body;
    }
  };
}

if (typeof global.Headers === "undefined") {
  global.Headers = class Headers {
    constructor(init) {
      this.headers = new Map();
      if (init) {
        Object.entries(init).forEach(([key, value]) => {
          this.headers.set(key.toLowerCase(), value);
        });
      }
    }

    get(name) {
      return this.headers.get(name.toLowerCase()) || null;
    }

    set(name, value) {
      this.headers.set(name.toLowerCase(), value);
    }
  };
}

// Fix BigInt serialization in jest-worker
Object.defineProperty(BigInt.prototype, "toJSON", {
  value: function () {
    return this.toString();
  },
});
