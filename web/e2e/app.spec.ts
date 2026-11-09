import {test,expect} from "@playwright/test";

// Retains network recovery, latest-model-discovery and save locking.
test("dashboard reports a network failure instead of staying on the loading screen", async ({
  page
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/domains", async (route) => {
    await route.abort("failed");
  });

  await page.goto("/");
  await expect(page.getByText("加载学习领域失败：无法连接到应用服务。", { exact: true })).toBeVisible();
  await expect(page.getByText("正在加载学习领域...", { exact: true })).not.toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("AI settings reports a network failure instead of staying on the loading screen", async ({
  page
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/ai/settings", async (route) => {
    await route.abort("failed");
  });

  await page.goto("/settings/ai");
  await expect(page.getByText("读取 AI 设置失败：无法连接到应用服务。", { exact: true })).toBeVisible();
  await expect(page.getByText("正在读取 AI 设置...", { exact: true })).not.toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("AI settings keeps model discovery results for the latest endpoint", async ({
  page
}) => {
  const modelRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/ai/models")) {
      modelRequests.push(request.postData() || "");
    }
  });
  await page.route("**/api/ai/settings", async (route) => {
    await route.fulfill({
      json: {
        saved: null,
        effective: null,
        source: "local-settings",
        env: {
          hasAiProvider: false,
          hasAiBaseUrl: false,
          hasAiModel: false,
          hasApiKey: false
        }
      }
    });
  });

  await page.route("**/api/ai/models", async (route) => {
    const payload = route.request().postDataJSON() as { baseUrl?: string };
    const baseUrl = payload.baseUrl || "";
    if (baseUrl.includes("first-endpoint")) {
      await new Promise((resolve) => setTimeout(resolve, 1800));
      await route.fulfill({
        json: {
          provider: "openai-compatible",
          baseUrl,
          models: [{ id: "first-model", ownedBy: "first" }],
          source: "api",
          selectedModel: "first-model",
          warning: null
        }
      });
      return;
    }

    if (baseUrl.includes("second-endpoint")) {
      await route.fulfill({
        json: {
          provider: "openai-compatible",
          baseUrl,
          models: [{ id: "second-model", ownedBy: "second" }],
          source: "api",
          selectedModel: "second-model",
          warning: null
        }
      });
      return;
    }

    await route.fulfill({
      json: {
        provider: "lmstudio",
        baseUrl,
        models: [{ id: "initial-model", ownedBy: "local" }],
        source: "preset",
        selectedModel: "initial-model",
        warning: null
      }
    });
  });

  await page.goto("/settings/ai");
  await expect(page.getByText(/当前 AI 尚未配置完整/)).toBeVisible();
  const baseUrlInput = page.getByLabel("接口地址");

  await baseUrlInput.fill("http://first-endpoint/v1");
  await page.waitForTimeout(700);
  await baseUrlInput.fill("http://second-endpoint/v1");

  await expect(page.locator('#ai-model-options option[value="second-model"]')).toHaveCount(1);
  await page.waitForTimeout(1300);
  expect(modelRequests).toHaveLength(2);
  await expect(page.locator('#ai-model-options option[value="second-model"]')).toHaveCount(1);
  await expect(page.locator('#ai-model-options option[value="first-model"]')).toHaveCount(0);
});

test("AI settings locks editable fields during a long save", async ({ page }) => {
  await page.route("**/api/ai/settings", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        json: {
          saved: null,
          effective: null,
          source: "local-settings",
          env: {
            hasAiProvider: false,
            hasAiBaseUrl: false,
            hasAiModel: false,
            hasApiKey: false
          }
        }
      });
      return;
    }

    if (route.request().method() === "PUT") {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({
        json: {
          saved: {
            provider: "openai-compatible",
            baseUrl: "http://save-endpoint/v1",
            hasApiKey: false,
            apiKeyMasked: "",
            model: "save-model",
            temperature: 0.25,
            timeoutMs: 45000,
            maxTokens: 1800
          },
          effective: {
            provider: "openai-compatible",
            baseUrl: "http://save-endpoint/v1",
            hasApiKey: false,
            apiKeyMasked: "",
            model: "save-model",
            temperature: 0.25,
            timeoutMs: 45000,
            maxTokens: 1800
          },
          source: "local-settings",
          env: {
            hasAiProvider: false,
            hasAiBaseUrl: false,
            hasAiModel: false,
            hasApiKey: false
          }
        }
      });
      return;
    }

    await route.fallback();
  });
  await page.route("**/api/ai/models", async (route) => {
    await route.fulfill({
      json: {
        provider: "lmstudio",
        baseUrl: "http://localhost:1234/v1",
        models: [],
        source: "preset",
        selectedModel: "",
        warning: null
      }
    });
  });

  await page.goto("/settings/ai");
  await expect(page.getByText(/当前 AI 尚未配置完整/)).toBeVisible();
  await page.getByLabel("服务提供方").selectOption("openai-compatible");
  await page.getByLabel("接口地址").fill("http://save-endpoint/v1");
  const modelInput = page.getByPlaceholder(
    "例如 gpt-4.1-mini 或 LM Studio 当前模型 ID"
  );
  await modelInput.fill("save-model");
  await page.getByRole("button", { name: "保存 AI 设置" }).click();

  await expect(page.getByLabel("服务提供方")).toBeDisabled();
  await expect(page.getByLabel("接口地址")).toBeDisabled();
  await expect(modelInput).toBeDisabled();
  await expect(page.getByText("AI 设置已保存。本地设置会优先生效。", { exact: true })).toBeVisible();
});
