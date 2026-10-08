import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { recordPassingMapDraftReview } from "./helpers/roadmap-quality";

type LearningDomain = {
  id: string;
  name: string;
};

const prisma = new PrismaClient();
const createdDomainIds = new Set<string>();

const cleanupE2eDomains = async (request: APIRequestContext) => {
  const domainIds = Array.from(createdDomainIds);
  createdDomainIds.clear();
  await Promise.all(
    domainIds.map((domainId) => request.delete(`/api/domains/${domainId}`))
  );
};

const createDomain = async (
  request: APIRequestContext,
  name: string
): Promise<LearningDomain> => {
  const response = await request.post("/api/domains", {
    data: {
      name,
      goal: "E2E verification",
      scope: "dashboard and canvas",
      outputTarget: "operable learning domain",
      depth: "applied"
    }
  });

  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  const domain = data.domain as LearningDomain;
  createdDomainIds.add(domain.id);
  return domain;
};

const trackDomainFromPlanningUrl = (url: string) => {
  const domainId = new URL(url).searchParams.get("domainId");
  if (domainId) createdDomainIds.add(domainId);
};

test.afterEach(async ({ request }) => {
  await cleanupE2eDomains(request);
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

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

test("dashboard can create a domain and open the knowledge graph", async ({
  page
}) => {
  const domainName = `e2e-app-domain-open-graph-${Date.now()}`;

  await page.goto("/");
  await page.locator('a[href="/learning/domains/new"]').click();
  await expect(
    page.getByRole("heading", { name: "创建可确认的学习路线" })
  ).toBeVisible();

  await page.getByLabel("领域名称").fill(domainName);
  await page
    .getByLabel("学习目标")
    .fill("Open the knowledge graph from the new domain flow");
  await page.getByRole("button", { name: "保存领域" }).click();
  await expect(page.getByText("领域已保存。")).toBeVisible();

  await page.getByRole("link", { name: "返回首页" }).click();
  await expect(page.getByRole("link", { name: domainName })).toBeVisible();
  await page.getByRole("link", { name: domainName }).click();
  await expect(
    page.getByRole("heading", { name: domainName, exact: true, level: 1 })
  ).toBeVisible();

  await page.locator('a[href$="/knowledge-graph"]').first().click();
  await expect(page).toHaveURL(/\/knowledge-graph$/);
});

test("dashboard deletion requires confirmation and removes the selected domain", async ({
  page,
  request
}) => {
  const domain = await createDomain(request, `e2e-app-domain-delete-${Date.now()}`);

  await page.goto("/");
  const domainLink = page.getByRole("link", { name: domain.name, exact: true });
  await expect(domainLink).toBeVisible();
  const domainCard = page
    .locator('section[class*="workshop-panel"]')
    .filter({ hasText: domain.name })
    .first();

  page.once("dialog", (dialog) => void dialog.dismiss());
  await domainCard.getByRole("button", { name: "删除领域", exact: true }).click();
  await expect(domainLink).toBeVisible();

  page.once("dialog", (dialog) => void dialog.accept());
  await domainCard.getByRole("button", { name: "删除领域", exact: true }).click();
  await expect(domainLink).toHaveCount(0);

  const deleted = await request.get(`/api/domains/${domain.id}`);
  expect(deleted.status()).toBe(404);
  createdDomainIds.delete(domain.id);
});

test("compatibility canvas remains reachable for a learning domain", async ({
  page,
  request
}) => {
  const domain = await createDomain(
    request,
    `e2e-app-domain-canvas-${Date.now()}`
  );

  await page.goto(`/canvas/${domain.id}`);

  await expect(
    page.getByText("Compatibility canvas: keep using this workspace only")
  ).toBeVisible({
    timeout: 10000
  });
  await expect(page.getByRole("link", { name: "Domain map" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Knowledge graph" })).toBeVisible();
  await expect(page.locator(".react-flow").first()).toBeVisible({ timeout: 10000 });
});

test("compatibility canvas reports a graph load network failure", async ({
  page,
  request
}) => {
  const domain = await createDomain(request, `e2e-app-canvas-graph-network-${Date.now()}`);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route(`**/api/graph?canvasId=${domain.id}`, async (route) => {
    await route.abort("failed");
  });

  await page.goto(`/canvas/${domain.id}`);
  await expect(
    page.getByText("加载兼容图谱失败：无法连接到应用服务。", { exact: true })
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("compatibility canvas can create and edit a node through the UI", async ({
  page,
  request
}) => {
  const domain = await createDomain(
    request,
    `e2e-app-canvas-create-edit-${Date.now()}`
  );
  const createdText = "UI created concept";
  const editedText = "UI edited concept";

  await page.goto(`/canvas/${domain.id}`);
  await page.getByRole("button", { name: /新建节点/ }).click();
  const createForm = page.locator("form").filter({ hasText: "新建节点" });
  await expect(createForm).toBeVisible();
  await createForm
    .getByPlaceholder("输入新节点/概念 (Word/Concept)")
    .fill(createdText);
  await createForm.getByPlaceholder("描述核心本质/定义").fill(
    "A concept created through the visible compatibility canvas flow."
  );
  await createForm.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page.locator(".react-flow__node").filter({ hasText: createdText })
  ).toBeVisible({ timeout: 10000 });

  await page
    .locator(".react-flow__node")
    .filter({ hasText: createdText })
    .click();
  await expect(page.getByText("节点详情与编辑")).toBeVisible();
  const editPanel = page.getByText("节点详情与编辑").locator("..");
  await editPanel.locator("input").first().fill(editedText);
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(page.getByText("已更新", { exact: true })).toBeVisible();
  await expect(
    page.locator(".react-flow__node").filter({ hasText: editedText })
  ).toBeVisible({ timeout: 10000 });
});

test("compatibility canvas persists a dragged node position", async ({
  page,
  request
}) => {
  const domain = await createDomain(request, `e2e-app-canvas-drag-${Date.now()}`);
  const draggedText = `e2e-drag-node-${Date.now()}`;
  const wordResponse = await request.post("/api/words", {
    data: {
      word: draggedText,
      language: "en",
      canvasId: domain.id,
      coreEssence: "A draggable compatibility node."
    }
  });
  expect(wordResponse.ok()).toBeTruthy();

  await page.goto(`/canvas/${domain.id}`);
  const node = page.locator(".react-flow__node").first();
  await expect(node).toBeVisible({ timeout: 10000 });
  await expect(node).toBeInViewport({ timeout: 10000 });

  const box = await node.boundingBox();
  expect(box).not.toBeNull();
  const startX = (box?.x || 0) + 48;
  const startY = (box?.y || 0) + 48;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 160, startY + 100, { steps: 12 });
  const positionResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/position") &&
      response.request().method() === "PATCH",
    { timeout: 5000 }
  );
  await page.mouse.up();

  const draggedPositionResponse = await positionResponse;
  expect(draggedPositionResponse.ok()).toBeTruthy();
  const draggedPosition = draggedPositionResponse.request().postDataJSON() as {
    x: number;
    y: number;
  };
  expect(draggedPosition.x).toBeGreaterThan(0);
  expect(draggedPosition.y).toBeGreaterThan(0);

  const graphResponse = await request.get(`/api/graph?canvasId=${domain.id}`);
  expect(graphResponse.ok()).toBeTruthy();
  const graphData = (await graphResponse.json()) as {
    words: Array<{ text: string; positionX: number | null; positionY: number | null }>;
  };
  const persistedWord = graphData.words.find((word) => word.text === draggedText);
  expect(persistedWord).toBeDefined();
  expect(persistedWord?.positionX).toBeCloseTo(draggedPosition.x, 10);
  expect(persistedWord?.positionY).toBeCloseTo(draggedPosition.y, 10);
});

test("compatibility canvas can import an exported graph without duplicating it", async ({
  page,
  request
}) => {
  const domain = await createDomain(
    request,
    `e2e-app-canvas-roundtrip-${Date.now()}`
  );
  const firstWordResponse = await request.post("/api/words", {
    data: {
      canvasId: domain.id,
      word: "Roundtrip source",
      coreEssence: "A source concept for export and import."
    }
  });
  const secondWordResponse = await request.post("/api/words", {
    data: {
      canvasId: domain.id,
      word: "Roundtrip target",
      coreEssence: "A target concept for export and import."
    }
  });
  expect(firstWordResponse.ok()).toBeTruthy();
  expect(secondWordResponse.ok()).toBeTruthy();
  const firstWord = await firstWordResponse.json();
  const secondWord = await secondWordResponse.json();
  const relationResponse = await request.post("/api/relations", {
    data: {
      canvasId: domain.id,
      fromWordId: firstWord.id,
      toWordId: secondWord.id,
      relationType: "related",
      detail: "Roundtrip relation"
    }
  });
  expect(relationResponse.ok()).toBeTruthy();

  await page.goto(`/canvas/${domain.id}`);
  await expect(page.getByText("Compatibility canvas: keep using this workspace only")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /导出图谱/ }).click();
  const download = await downloadPromise;
  const exportPath = await download.path();
  expect(exportPath).toBeTruthy();
  const exportedPayload = JSON.parse(
    await (await import("node:fs/promises")).readFile(exportPath!, "utf8")
  );

  const importResponse = await request.post(`/api/canvas/${domain.id}/import`, {
    data: exportedPayload
  });
  expect(importResponse.ok(), JSON.stringify(await importResponse.json())).toBeTruthy();

  await page.locator('input[type="file"][accept=".json"]').setInputFiles(exportPath!);
  await expect(page.getByRole("status")).toContainText("导入完成");
  await expect(page.getByRole("status")).toContainText("跳过 1 条重复关系");
});

test("compatibility canvas keeps a node visible when deletion fails", async ({
  page,
  request
}) => {
  const domain = await createDomain(
    request,
    `e2e-app-canvas-delete-failure-${Date.now()}`
  );
  const wordText = "Delete failure source";
  const wordResponse = await request.post("/api/words", {
    data: {
      canvasId: domain.id,
      word: wordText,
      coreEssence: "A node used to verify failed deletion feedback."
    }
  });
  expect(wordResponse.ok()).toBeTruthy();
  const word = await wordResponse.json();

  await page.goto(`/canvas/${domain.id}`);
  const node = page.locator(".react-flow__node").filter({ hasText: wordText });
  await expect(node).toBeVisible({ timeout: 10000 });
  await node.click();
  await expect(page.getByText("节点详情与编辑")).toBeVisible();

  await page.route(`**/api/words/${word.id}*`, async (route) => {
    if (route.request().method() === "DELETE") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "模拟删除失败" })
      });
      return;
    }
    await route.continue();
  });
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: /删除该节点/ }).click();

  await expect(page.getByText("模拟删除失败")).toBeVisible();
  await expect(page.getByText("节点详情与编辑")).toBeVisible();
  await expect(node).toBeVisible();
});

test("compatibility canvas reports failed manual relation creation", async ({
  page,
  request
}) => {
  const domain = await createDomain(
    request,
    `e2e-app-canvas-relation-failure-${Date.now()}`
  );
  const sourceText = "Relation failure source";
  const targetText = "Relation failure target";
  const sourceResponse = await request.post("/api/words", {
    data: {
      canvasId: domain.id,
      word: sourceText,
      coreEssence: "A source node for relation failure feedback."
    }
  });
  const targetResponse = await request.post("/api/words", {
    data: {
      canvasId: domain.id,
      word: targetText,
      coreEssence: "A target node for relation failure feedback."
    }
  });
  expect(sourceResponse.ok()).toBeTruthy();
  expect(targetResponse.ok()).toBeTruthy();

  await page.goto(`/canvas/${domain.id}`);
  const sourceNode = page
    .locator(".react-flow__node")
    .filter({ hasText: sourceText });
  await expect(sourceNode).toBeVisible({ timeout: 10000 });
  await sourceNode.click();
  await expect(page.getByText("关系管理")).toBeVisible();

  await page.route("**/api/relations", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "模拟关系保存失败" })
      });
      return;
    }
    await route.continue();
  });
  await page
    .getByPlaceholder("输入或选择目标单词")
    .fill(`${targetText} · 未知`);
  await page.getByPlaceholder("关系类型（如 derive/synonym）").fill("related");
  await page.getByRole("button", { name: "添加", exact: true }).last().click();

  await expect(page.getByText("模拟关系保存失败")).toBeVisible();
  await expect(
    page.getByPlaceholder("输入或选择目标单词")
  ).toHaveValue(`${targetText} · 未知`);
});

test("compatibility canvas reports failed relation updates", async ({
  page,
  request
}) => {
  const domain = await createDomain(
    request,
    `e2e-app-canvas-relation-update-failure-${Date.now()}`
  );
  const sourceText = "Relation update source";
  const targetText = "Relation update target";
  const sourceResponse = await request.post("/api/words", {
    data: {
      canvasId: domain.id,
      word: sourceText,
      coreEssence: "A source node for relation update feedback."
    }
  });
  const targetResponse = await request.post("/api/words", {
    data: {
      canvasId: domain.id,
      word: targetText,
      coreEssence: "A target node for relation update feedback."
    }
  });
  expect(sourceResponse.ok()).toBeTruthy();
  expect(targetResponse.ok()).toBeTruthy();
  const source = await sourceResponse.json();
  const target = await targetResponse.json();
  const relationResponse = await request.post("/api/relations", {
    data: {
      canvasId: domain.id,
      fromWordId: source.id,
      toWordId: target.id,
      relationType: "related",
      detail: "Original relation"
    }
  });
  expect(relationResponse.ok()).toBeTruthy();
  const relationData = await relationResponse.json();
  const relationId = relationData.relation.id;

  await page.goto(`/canvas/${domain.id}`);
  const sourceNode = page
    .locator(".react-flow__node")
    .filter({ hasText: sourceText });
  await expect(sourceNode).toBeVisible({ timeout: 10000 });
  await sourceNode.click();
  const relationCard = page
    .getByText(`${sourceText} → ${targetText}`, { exact: true })
    .locator("..");
  await expect(relationCard).toBeVisible();
  await relationCard.locator("input").first().fill("derive");

  await page.route(`**/api/relations/${relationId}*`, async (route) => {
    if (["PUT", "DELETE"].includes(route.request().method())) {
      const message =
        route.request().method() === "PUT"
          ? "模拟关系更新失败"
          : "模拟关系删除失败";
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: message })
      });
      return;
    }
    await route.continue();
  });
  await relationCard.getByRole("button", { name: "保存", exact: true }).click();

  await expect(page.getByText("模拟关系更新失败")).toBeVisible();
  await expect(relationCard.locator("input").first()).toHaveValue("derive");
  await relationCard.getByRole("button", { name: "删除", exact: true }).click();
  await expect(page.getByText("模拟关系删除失败")).toBeVisible();
  await expect(relationCard).toBeVisible();
});

test("compatibility canvas reports failed wormhole creation", async ({
  page,
  request
}) => {
  const sourceDomain = await createDomain(
    request,
    `e2e-app-canvas-wormhole-source-${Date.now()}`
  );
  const targetDomain = await createDomain(
    request,
    `e2e-app-canvas-wormhole-target-${Date.now()}`
  );
  const sourceText = "Wormhole failure source";
  const targetText = "Wormhole failure target";
  const sourceResponse = await request.post("/api/words", {
    data: {
      canvasId: sourceDomain.id,
      word: sourceText,
      coreEssence: "A source node for wormhole failure feedback."
    }
  });
  const targetResponse = await request.post("/api/words", {
    data: {
      canvasId: targetDomain.id,
      word: targetText,
      coreEssence: "A target node for wormhole failure feedback."
    }
  });
  expect(sourceResponse.ok()).toBeTruthy();
  expect(targetResponse.ok()).toBeTruthy();

  await page.goto(`/canvas/${sourceDomain.id}`);
  const sourceNode = page
    .locator(".react-flow__node")
    .filter({ hasText: sourceText });
  await expect(sourceNode).toBeVisible({ timeout: 10000 });
  await sourceNode.click();
  await expect(page.getByText("虫洞连接")).toBeVisible();
  await expect(page.getByRole("option", { name: targetDomain.name })).toHaveCount(1);
  await page.getByRole("combobox").first().selectOption(targetDomain.id);
  const targetSearch = page.getByPlaceholder("搜索目标节点");
  await targetSearch.fill(targetText);
  const targetOption = page.getByRole("button", {
    name: `${targetText} · 未知`,
    exact: true
  });
  await expect(targetOption).toBeVisible();
  await targetOption.click();

  await page.route("**/api/relations", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "模拟虫洞创建失败" })
      });
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: /建立虫洞/ }).click();

  await expect(page.getByText("模拟虫洞创建失败")).toBeVisible();
  await expect(targetSearch).toHaveValue(`${targetText} · 未知`);
});

test("compatibility canvas keeps the relation editor open when edge update fails", async ({
  page,
  request
}) => {
  const domain = await createDomain(
    request,
    `e2e-app-canvas-edge-update-failure-${Date.now()}`
  );
  const sourceResponse = await request.post("/api/words", {
    data: {
      canvasId: domain.id,
      word: "Edge editor source",
      coreEssence: "A source node for edge editor failure feedback."
    }
  });
  const targetResponse = await request.post("/api/words", {
    data: {
      canvasId: domain.id,
      word: "Edge editor target",
      coreEssence: "A target node for edge editor failure feedback."
    }
  });
  expect(sourceResponse.ok()).toBeTruthy();
  expect(targetResponse.ok()).toBeTruthy();
  const source = await sourceResponse.json();
  const target = await targetResponse.json();
  const relationResponse = await request.post("/api/relations", {
    data: {
      canvasId: domain.id,
      fromWordId: source.id,
      toWordId: target.id,
      relationType: "related",
      detail: "Edge editor relation"
    }
  });
  expect(relationResponse.ok()).toBeTruthy();
  const relationData = await relationResponse.json();
  const relationId = relationData.relation.id;

  await page.goto(`/canvas/${domain.id}`);
  const edge = page.locator(".react-flow__edge-path").first();
  await expect(edge).toHaveCount(1, { timeout: 10000 });
  await page.locator(".react-flow__edge-interaction").first().dispatchEvent("click");
  const editor = page.locator("form").filter({ hasText: "修改关系类型" });
  await expect(editor).toBeVisible();

  await page.route(`**/api/relations/${relationId}*`, async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "模拟边编辑失败" })
      });
      return;
    }
    await route.continue();
  });
  await editor.locator("select").selectOption("derive");
  await editor.getByRole("button", { name: "保存", exact: true }).click();

  await expect(page.getByText("模拟边编辑失败")).toBeVisible();
  await expect(editor).toBeVisible();
  await expect(editor.locator("select")).toHaveValue("derive");
});

test("domain creation resumes the confirmed task brief after refresh without duplication", async ({
  page,
  request
}) => {
  const domainName = `e2e-app-domain-resume-${Date.now()}`;

  await page.goto("/learning/domains/new");
  await page.getByLabel("领域名称").fill(domainName);
  await page.getByLabel("学习目标").fill("Resume the same planning workflow.");
  await page
    .getByLabel("任务书草稿")
    .fill("Build one recoverable learning-domain planning flow.");
  await page.getByRole("button", { name: "确认任务书" }).click();

  await expect(page).toHaveURL(/\/learning\/domains\/new\?domainId=/);
  trackDomainFromPlanningUrl(page.url());
  await expect(page.getByText("已确认", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("已恢复这个学习领域的创建进度。"))
    .toBeVisible();
  await expect(page.getByLabel("领域名称")).toHaveValue(domainName);
  await expect(page.getByText("已确认", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "返回首页" }).click();
  await page.getByRole("link", { name: domainName }).click();
  await page.getByRole("link", { name: "去生成地图" }).click();
  await expect(page).toHaveURL(/\/learning\/domains\/new\?domainId=/);
  await expect(page.getByText("已恢复这个学习领域的创建进度。"))
    .toBeVisible();
  await expect(page.getByText("已确认", { exact: true })).toBeVisible();

  const domainsResponse = await request.get("/api/domains");
  const domainsData = await domainsResponse.json();
  expect(
    (domainsData.domains as LearningDomain[]).filter(
      (domain) => domain.name === domainName
    )
  ).toHaveLength(1);

  await page.getByLabel("学习目标").fill("A revised planning goal.");
  await page.getByRole("button", { name: "保存领域" }).click();
  await expect(page.getByText("领域已保存。")).toBeVisible();
  await expect(page.getByText("已确认", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("学习目标")).toHaveValue(
    "A revised planning goal."
  );
  await expect(page.getByText("已确认", { exact: true })).toHaveCount(0);
});

test("domain creation restores persisted course design and map draft after refresh", async ({
  page,
  request
}) => {
  const domain = await createDomain(
    request,
    `e2e-app-domain-planning-recovery-${Date.now()}`
  );
  const taskBrief = "Build a recoverable TypeScript learning route.";
  const courseDesign = {
    taskBriefSnapshot: taskBrief,
    globalExplanation: {
      theorySkeleton: "Types before framework integration.",
      sourceBasis: "Official TypeScript documentation.",
      optimizationRationale: "Prerequisites first.",
      risksAndValidation: "Validate JavaScript foundations."
    },
    sources: [
      {
        url: "https://www.typescriptlang.org/docs/handbook/intro.html",
        title: "TypeScript Handbook",
        reason: "Official language reference."
      }
    ],
    keyTradeoffs: ["Prefer project relevance."],
    qualityGate: { passed: true, missing: [] }
  };
  const mapDraft = {
    planningVersion: 2 as const,
    title: "Recovered TypeScript route",
    status: "draft",
    baseRevision: 0,
    stages: [
      {
        key: "types",
        title: "Type foundations",
        goal: "Model application data.",
        status: "planned",
        rationale: "Foundation first.",
        moduleDirections: ["primitive types", "object types"],
        moduleBlueprints: [
          {
            key: "type-foundations",
            title: "Type foundations",
            goal: "Model application data.",
            keyQuestions: [
              {
                key: "type-model",
                question: "How do types model application data?",
                checkableOutcome: "Model one data boundary with a type."
              }
            ]
          }
        ],
        prerequisiteStageKeys: [],
        modules: []
      }
    ]
  };

  const briefResponse = await request.patch(`/api/domains/${domain.id}`, {
    data: { taskBrief }
  });
  expect(briefResponse.ok()).toBeTruthy();
  const confirmationResponse = await request.patch(
    `/api/domains/${domain.id}/task-brief`
  );
  expect(confirmationResponse.ok()).toBeTruthy();
  await prisma.domain.update({
    where: { id: domain.id },
    data: {
      courseDesignDraft: JSON.stringify(courseDesign),
      courseDesignStatus: "draft",
      courseDesignRepairCount: 2,
      courseDesignAiCallLogId: `e2e-course-design-${domain.id}`,
      roadmapDraftJson: JSON.stringify(mapDraft),
      roadmapDraftCourseDesignAiCallLogId: `e2e-course-design-${domain.id}`,
      roadmapStatus: "draft"
    }
  });
  await recordPassingMapDraftReview(prisma, {
    domainId: domain.id,
    draft: mapDraft,
    courseDesignAiCallLogId: `e2e-course-design-${domain.id}`,
    scope: "skeleton"
  });
  await page.route(`**/api/domains/${domain.id}/map/reviews`, async (route) => {
    const mapResponse = await request.get(`/api/domains/${domain.id}/map`);
    expect(mapResponse.ok()).toBeTruthy();
    const mapData = await mapResponse.json();
    await recordPassingMapDraftReview(prisma, {
      domainId: domain.id,
      draft: mapData.draft,
      courseDesignAiCallLogId: mapData.draftCourseDesignAiCallLogId,
      scope: "skeleton"
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        draft: mapData.draft,
        mapRevision: mapData.mapRevision,
        reviewState: "passed",
        qualityReport: {
          status: "passed",
          summary: "E2E edited blueprint review passed.",
          blockingIssues: [],
          warnings: []
        },
        aiCallLogIds: ["e2e-blueprint-review"],
        repairAttempts: 0
      })
    });
  });

  await page.goto(`/learning/domains/new?domainId=${domain.id}`);

  await expect(page.getByText("已恢复这个学习领域的创建进度。"))
    .toBeVisible();
  await expect(page.getByLabel("领域名称")).toHaveValue(domain.name);
  await expect(page.getByText("TypeScript Handbook")).toBeVisible();
  await expect(page.getByText("地图骨架：Recovered TypeScript route"))
    .toBeVisible();
  await expect(page.getByText(/Type foundations/).first()).toBeVisible();
  await expect(page.getByText(/已恢复完整 Stage 骨架：1 个阶段/)).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("领域名称")).toHaveValue(domain.name);
  await expect(page.getByText("已确认", { exact: true })).toBeVisible();
  await expect(page.getByText("TypeScript Handbook")).toBeVisible();
  await expect(page.getByText("地图骨架：Recovered TypeScript route"))
    .toBeVisible();

  const planningQuestion = page.getByPlaceholder("原子化关键问题");
  await planningQuestion.fill("How should types model one application boundary?");
  await expect(page.getByText("已编辑，等待复审", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "确认地图并进入学习" })
  ).toBeDisabled();
  await page.getByRole("button", { name: "保存并复审路线质量" }).click();
  await expect(page.getByText("质量复审已通过", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "确认地图并进入学习" })
  ).toBeEnabled();
});

test("a confirmed formal map leaves the creation wizard on recovery", async ({
  page
}) => {
  const domainId = "confirmed-domain-recovery-fixture";
  await page.route(`**/api/domains/${domainId}`, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        domain: {
          id: domainId,
          name: "Confirmed domain",
          taskBrief: "Confirmed task brief",
          taskBriefConfirmedAt: "2026-07-19T04:00:00.000Z"
        }
      })
    })
  );
  await page.route(`**/api/domains/${domainId}/course-design`, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        courseDesign: {
          draft: null,
          status: "confirmed",
          repairCount: 0,
          confirmedAt: "2026-07-19T04:10:00.000Z",
          aiCallLogId: "log-confirmed"
        }
      })
    })
  );
  await page.route(`**/api/domains/${domainId}/map`, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ map: {}, draft: null, mapRevision: 1 })
    })
  );
  await page.route(`**/api/domains/${domainId}/nodes/*`, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ node: null })
    })
  );

  await page.goto(`/learning/domains/new?domainId=${domainId}`);

  await expect(page).toHaveURL(`/learning/domains/${domainId}`);
});

test("a learner can confirm a mocked AI plan from the blank wizard", async ({
  page
}) => {
  const domainName = `e2e-app-mocked-ai-plan-${Date.now()}`;
  const planningQuestion = {
    key: "concept-a-question",
    question: "What does Concept A explain?",
    checkableOutcome: "Explain Concept A with an example and boundary."
  };
  const moduleBlueprint = {
    key: "foundations",
    title: "Foundations",
    goal: "Build a stable conceptual base.",
    keyQuestions: [planningQuestion]
  };
  const courseDesignDraft = {
    taskBriefSnapshot: "Build a checked learning route.",
    globalExplanation: {
      theorySkeleton: "Build the concept before applying it.",
      sourceBasis: "A controlled source for this UI contract test.",
      optimizationRationale: "Keep the route small and checkable.",
      risksAndValidation: "The learner must explain a boundary."
    },
    sources: [
      {
        url: "https://www.typescriptlang.org/docs/handbook/intro.html",
        title: "Controlled source",
        reason: "A deterministic source for the mocked plan."
      }
    ],
    keyTradeoffs: ["Prefer checkability over breadth."],
    qualityGate: { passed: true, missing: [] }
  };
  const mapDraft = {
    planningVersion: 2 as const,
    title: "Mocked learning map",
    status: "draft",
    baseRevision: 0,
    stages: [
      {
        key: "core",
        title: "Core concepts",
        goal: "Explain the core concept.",
        status: "planned" as const,
        rationale: "Start with one bounded concept.",
        moduleDirections: ["Foundations"],
        moduleBlueprints: [moduleBlueprint],
        prerequisiteStageKeys: [],
        modules: [
          { title: "Foundations", goal: "Build a stable conceptual base.", items: [] }
        ]
      }
    ]
  };
  const skeleton = {
    planningVersion: 2 as const,
    title: "Mocked learning map",
    status: "draft",
    stages: [
      {
        key: "core",
        title: "Core concepts",
        goal: "Explain the core concept.",
        coreTopics: ["Foundations"],
        prerequisiteStageTitles: [],
        prerequisiteStageKeys: [],
        moduleBlueprints: [moduleBlueprint]
      }
    ]
  };
  const qualityReport = {
    status: "passed" as const,
    summary: "The deterministic mocked route passed review.",
    blockingIssues: [],
    warnings: []
  };
  const sourceRelevanceDraft = {
    ...courseDesignDraft,
    sources: [
      {
        ...courseDesignDraft.sources[0],
        grounding: {
          ok: true,
          status: 200,
          title: "Controlled source",
          excerpt: "A controlled excerpt supporting the route.",
          relevance: { score: 0.9, lowRelevance: false },
          aiRelevance: {
            score: 0.91,
            lowRelevance: false,
            reason: "The source directly supports the route."
          }
        }
      }
    ]
  };
  let latestMapDraft = mapDraft;
  let mapConfirmed = false;

  await page.route("**/api/domains/*/course-design/ai-draft", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        source: "ai",
        draft: courseDesignDraft,
        aiCallLogId: "e2e-mocked-course-design-log",
        repair: {
          attempted: false,
          attempts: 0,
          totalAttempts: 0,
          succeeded: false
        }
      })
    })
  );
  await page.route("**/api/domains/*/map/ai-draft", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        skeleton,
        draft: mapDraft,
        mapRevision: 0,
        reviewState: "passed",
        qualityReport,
        courseDesignAiCallLogId: "e2e-mocked-course-design-log"
      })
    })
  );
  await page.route("**/api/domains/*/workflow", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        workflow: {
          phase: mapConfirmed ? "needs_stage_expansion" : "ready_to_confirm_map",
          allowedActions: mapConfirmed ? ["EXPAND_STAGE"] : ["CONFIRM_MAP"],
          blockers: []
        }
      })
    })
  );
  await page.route("**/api/domains/*/course-design/source-relevance-check", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ source: "ai", draft: sourceRelevanceDraft })
    })
  );
  await page.route("**/api/domains/*/map/reviews", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        draft: latestMapDraft,
        mapRevision: 0,
        reviewState: "passed",
        qualityReport
      })
    })
  );
  await page.route("**/api/domains/*/map", async (route) => {
    const request = route.request();
    if (request.method() === "PATCH") {
      const payload = request.postDataJSON() as { draft?: typeof mapDraft };
      if (payload.draft) latestMapDraft = payload.draft;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          draft: latestMapDraft,
          mapRevision: 0,
          reviewState: "passed",
          qualityReport
        })
      });
      return;
    }
    if (request.method() === "POST") {
      mapConfirmed = true;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          map: { domain: { id: "mocked-domain" }, units: [], nodes: [] },
          mapRevision: 1
        })
      });
      return;
    }
    await route.fallback();
  });

  await page.goto("/learning/domains/new");
  await page.getByLabel("领域名称").fill(domainName);
  await page.getByLabel("当前水平").fill("Basic JavaScript and React.");
  await page.getByLabel("学习目标").fill("Build a checked learning route.");
  await page.getByLabel("输出类型").fill("Project");
  await page.getByLabel("输出目标").fill("A small explainable project.");
  await page.getByLabel("深度").fill("Applied in two weeks.");
  await page.getByLabel("背景描述").fill("Can explain basic concepts.");
  await page.getByLabel("排除范围").fill("Advanced compiler internals.");
  await page.getByLabel("任务书草稿").fill("Build a checked learning route.");
  await page.getByRole("button", { name: "确认任务书" }).click();
  await expect(page).toHaveURL(/\/learning\/domains\/new\?domainId=/);
  const createdDomainId = new URL(page.url()).searchParams.get("domainId");
  expect(createdDomainId).toBeTruthy();
  trackDomainFromPlanningUrl(page.url());

  await page.getByRole("button", { name: "AI 生成课程设计方向" }).click();
  await expect(
    page.getByText(
      "AI 已生成课程设计方向；它会与完整 Stage 骨架一起确认。",
      { exact: true }
    )
  ).toBeVisible();
  await page.getByRole("button", { name: "用 AI 复核来源相关性" }).click();
  await expect(page.getByText("AI 相关性 91%", { exact: true })).toBeVisible();
  await expect(page.getByText("AI 复核：The source directly supports the route.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "AI 生成完整 Stage 骨架" }).click();
  await expect(page.getByText("地图骨架：Mocked learning map")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "确认地图并进入学习" })
  ).toBeEnabled();

  await page.getByLabel("Stage 1 标题").fill("Core concepts refined");
  await expect(page.getByText("已编辑，等待复审", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "确认地图并进入学习" })
  ).toBeDisabled();
  await page.getByRole("button", { name: "保存并复审路线质量" }).click();
  await expect(page.getByText("质量复审已通过", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "确认地图并进入学习" })
  ).toBeEnabled();

  await page.getByRole("button", { name: "确认地图并进入学习" }).click();
  await expect(page).toHaveURL(`/learning/domains/${createdDomainId}`);
  expect(mapConfirmed).toBe(true);
  await expect(page.getByRole("heading", { name: domainName })).toBeVisible();
});

test("course research exposes bounded automatic repair and an explicit AI retry", async ({
  page
}) => {
  const domainName = `e2e-app-course-repair-${Date.now()}`;
  const incompleteDraft = {
    taskBriefSnapshot: "Build a source-backed TypeScript React route.",
    globalExplanation: {
      theorySkeleton: "Start with TypeScript types, then apply them to React.",
      sourceBasis: "Sources still need repair.",
      optimizationRationale: "Language concepts precede framework integration.",
      risksAndValidation: "Validate current JavaScript and React knowledge."
    },
    sources: [],
    keyTradeoffs: ["Prefer project relevance."],
    qualityGate: { passed: false, missing: ["sources"] }
  };
  const repairedDraft = {
    ...incompleteDraft,
    sources: [
      {
        url: "https://www.typescriptlang.org/docs/handbook/intro.html",
        title: "TypeScript Handbook",
        reason: "Official language concepts and examples."
      }
    ],
    qualityGate: { passed: true, missing: [] }
  };
  let requestCount = 0;

  await page.route("**/api/domains/*/course-design/ai-draft", async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const isFinalRepair = requestCount === 3;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        isFinalRepair
          ? {
              source: "ai",
              draft: repairedDraft,
              aiCallLogId: "repair-log-3",
              repair: {
                attempted: true,
                attempts: 1,
                totalAttempts: 3,
                succeeded: true,
                initialAiCallLogId: "repair-log-2",
                aiCallLogIds: ["repair-log-3"]
              }
            }
          : {
              source: requestCount === 1 ? "fallback" : "ai",
              draft: incompleteDraft,
              aiCallLogId: requestCount === 1 ? null : "repair-log-2",
              repair: {
                attempted: requestCount === 2,
                attempts: requestCount === 2 ? 2 : 0,
                totalAttempts: requestCount === 2 ? 2 : 0,
                succeeded: false,
                initialAiCallLogId: requestCount === 2 ? "research-log-1" : null,
                aiCallLogIds:
                  requestCount === 2
                    ? ["repair-log-1", "repair-log-2"]
                    : []
              },
              warning:
                requestCount === 1
                  ? "AI provider is not configured."
                  : "Course design still misses sources."
            }
      )
    });
  });

  await page.goto("/learning/domains/new");
  await page.getByLabel("领域名称").fill(domainName);
  await page.getByLabel("当前水平").fill("Basic JavaScript and React.");
  await page.getByLabel("学习目标").fill("Build a typed React app.");
  await page.getByLabel("输出类型").fill("Project");
  await page.getByLabel("输出目标").fill("A small typed React app.");
  await page.getByLabel("深度").fill("Project-ready in two weeks.");
  await page.getByLabel("背景描述").fill("Can build small React components.");
  await page.getByLabel("排除范围").fill("Advanced type-level programming.");
  await page
    .getByLabel("任务书草稿")
    .fill("Build a source-backed TypeScript React route.");
  await expect(
    page.getByRole("button", { name: "AI 生成课程设计方向" })
  ).toBeDisabled();
  await expect(
    page.getByText(/请先在第 2 步确认任务书/)
  ).toBeVisible();
  await page.getByRole("button", { name: "确认任务书" }).click();
  trackDomainFromPlanningUrl(page.url());

  await page.route("**/api/domains/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (
      request.method() === "PATCH" &&
      /^\/api\/domains\/[^/]+$/.test(pathname)
    ) {
      await page.waitForTimeout(5500);
    }
    await route.fallback();
  });
  await page.getByRole("button", { name: "AI 生成课程设计方向" }).click();
  await expect(
    page.getByText(/请求已开始：正在等待云端 AI/)
  ).toBeVisible();
  await expect(
    page.getByText(/云端 AI 课程研究未完成，正式地图保持阻断/)
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByText(/服务提示：AI provider is not configured/)
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "检查或切换 AI 设置" })
  ).toHaveAttribute("href", "/settings/ai");

  await page.getByRole("button", { name: "AI 再次自动修复" }).click();
  await expect(page.getByText(/本次修复 2 次后仍未通过质量门/)).toBeVisible();
  await expect(page.getByText("课程设计仍未通过质量门")).toBeVisible();
  await expect(page.getByText(/缺失或无效项：sources/)).toBeVisible();
  await expect(page.getByText(/已累计自动修复 2 次/)).toBeVisible();

  await page.getByRole("button", { name: "AI 再次自动修复" }).click();
  await expect(page.getByText(/AI 已修复课程设计方向并通过质量门/)).toBeVisible();
  await expect(page.getByText("等待与 Stage 骨架一起确认")).toBeVisible();
  expect(requestCount).toBe(3);
});

test("domain planning locks mutable inputs during a long AI request", async ({
  page
}) => {
  const domainName = `e2e-app-planning-lock-${Date.now()}`;
  await page.route("**/api/domains/*/course-design/ai-draft", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        source: "ai",
        draft: null,
        aiCallLogId: "planning-lock-log"
      })
    });
  });

  await page.goto("/learning/domains/new");
  await page.getByLabel("领域名称").fill(domainName);
  await page.getByLabel("任务书草稿").fill("Build a reliable typed learning route.");
  await page.getByRole("button", { name: "确认任务书" }).click();
  trackDomainFromPlanningUrl(page.url());
  await page.getByRole("button", { name: "AI 生成课程设计方向" }).click();
  await expect(page.getByText(/请求已开始：正在等待云端 AI/)).toBeVisible();
  await expect(page.getByLabel("任务书草稿")).toBeDisabled();
});
