export default {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/backend"],
  testMatch: ["**/?(*.)+(spec|test).ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  collectCoverageFrom: [
    "backend/src/**/*.ts",
    "!backend/src/**/*.d.ts",
    "!backend/src/**/index.ts",
  ],
  coveragePathIgnorePatterns: ["/node_modules/"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
