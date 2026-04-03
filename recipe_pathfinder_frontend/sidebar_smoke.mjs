import puppeteer from 'puppeteer';

const baseUrl = process.env.SIDEBAR_SMOKE_URL || 'http://127.0.0.1:8000';
const solveResponse = {
  request: {
    target: 'gtceu:lv_machine_hull',
    target_kind: 'item',
    target_amount: 1,
    available_materials: ['minecraft:iron_ingot'],
    whitelist: [],
    blacklist: [],
    max_depth: 64,
    max_trees: 32,
    max_branching_per_material: 20,
    max_nodes_per_tree: 100,
    enable_surplus_reuse: false,
  },
  summary: {
    tree_count: 2,
    fully_resolved_count: 1,
    partially_resolved_count: 1,
    cycle_cut_count: 0,
    blacklist_cut_count: 0,
    no_recipe_count: 0,
    max_depth_cut_count: 0,
    surplus_satisfied_count: 0,
    search_duration_ms: 12,
  },
  trees: [
    {
      status: 'fully_resolved',
      status_reasons: [],
      metrics: {
        step_count: 2,
        total_duration: 40,
        total_eut: 30,
        surplus_satisfied_count: 0,
        failure_count: 0,
      },
      children: [
        {
          node_type: 'recipe_choice',
          recipe_id: 'gtceu:assembler/lv_machine_hull',
          recipe_type: 'item',
          machine_type: 'assembler',
          duration: 40,
          eut: 30,
          runs: 1,
          primary_output: 'gtceu:lv_machine_hull',
          inputs: [
            { material: 'gtceu:red_alloy', amount: 8 },
            { material: 'modpack:raw_gear', amount: 2 },
          ],
          outputs: [{ material: 'gtceu:lv_machine_hull', amount: 1 }],
          children: [
            {
              node_type: 'material_need',
              material: 'gtceu:red_alloy',
              required_amount: 8,
              status: 'source_matched',
            },
            {
              node_type: 'material_need',
              material: 'modpack:raw_gear',
              required_amount: 2,
              status: 'expanded',
            },
          ],
        },
      ],
    },
    {
      status: 'partially_resolved',
      status_reasons: ['no_recipe'],
      metrics: {
        step_count: 1,
        total_duration: 25,
        total_eut: 20,
        surplus_satisfied_count: 0,
        failure_count: 1,
      },
      children: [],
    },
  ],
};

const apiHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const solveRequests = [];
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();

try {
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = request.url();

    if (request.method() === 'GET' && url.endsWith('/api/materials')) {
      void request.respond({
        status: 200,
        contentType: 'application/json',
        headers: apiHeaders,
        body: JSON.stringify([
          'gtceu:lv_machine_hull',
          'gtceu:red_alloy',
          'modpack:raw_gear',
          'modpack:custom_item',
          'minecraft:iron_ingot',
          'minecraft:redstone',
          'minecraft:water',
        ]),
      });
      return;
    }

    if (request.method() === 'GET' && url.endsWith('/api/recipes/files')) {
      void request.respond({
        status: 500,
        contentType: 'application/json',
        headers: apiHeaders,
        body: JSON.stringify({ error: 'intentional smoke failure' }),
      });
      return;
    }

    if (request.method() === 'POST' && url.endsWith('/api/solve')) {
      const requestBody = JSON.parse(request.postData() || '{}');
      solveRequests.push(requestBody);
      void request.respond({
        status: 200,
        contentType: 'application/json',
        headers: apiHeaders,
        body: JSON.stringify({
          ...solveResponse,
          request: requestBody,
        }),
      });
      return;
    }

    void request.continue();
  });

  await page.setViewport({ width: 390, height: 320, deviceScaleFactor: 1 });
  await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 20000 });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('gtp_show_localization_panel', 'true');
    localStorage.setItem('gtp_show_data_panel', 'true');
    localStorage.setItem('gtp_show_materials_panel', 'true');
    localStorage.setItem('gtp_show_whitelist_panel', 'true');
    localStorage.setItem('gtp_show_blacklist_panel', 'true');
    localStorage.setItem('gtp_show_tree_panel', 'true');
    localStorage.setItem(
      'gtp_localization_packs',
      JSON.stringify([
        {
          id: 'user-1',
          name: 'test-pack',
          fileName: 'test-pack.json',
          uploadOrder: 1,
          entryCount: 1,
          translations: { 'modpack:raw_gear': 'Localized Raw Gear' },
        },
      ]),
    );
  });
  await page.reload({ waitUntil: 'networkidle0', timeout: 20000 });
  await page.evaluate(() => {
    window.__downloadPayloads = [];
    window.__downloadNames = [];
    const originalCreate = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      blob.text().then((text) => window.__downloadPayloads.push(text));
      return originalCreate(blob);
    };

    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function click() {
      window.__downloadNames.push(this.download || '');
      return originalClick.call(this);
    };
  });

  const layoutCheck = await page.evaluate(() => {
    const footer = document.querySelector('.sidebar-footer-actions');
    const footerButton = document.querySelector('.sidebar-footer-actions .btn-primary');
    const scrollBody = document.querySelector('.sidebar-scroll-body');
    const sidebarCards = document.querySelectorAll('.sidebar-card');

    if (!(footer instanceof HTMLElement) || !(footerButton instanceof HTMLElement) || !(scrollBody instanceof HTMLElement)) {
      return { ok: false, reason: 'missing footer, button, or scroll body' };
    }

    const footerRect = footer.getBoundingClientRect();
    const buttonRect = footerButton.getBoundingClientRect();

    return {
      ok: sidebarCards.length >= 4 && buttonRect.top >= footerRect.top && buttonRect.bottom <= footerRect.bottom,
      reason: sidebarCards.length >= 4 ? null : 'expected sidebar cards missing',
    };
  });

  if (!layoutCheck.ok) {
    throw new Error(`layout check failed: ${layoutCheck.reason}`);
  }

  const uploadCheck = await page.evaluate(async () => {
    const scrollBody = document.querySelector('.sidebar-scroll-body');
    const icon = document.querySelector('.lucide-database');
    const toggle = icon?.parentElement?.parentElement;
    const card = toggle?.closest('.sidebar-card');

    if (!(scrollBody instanceof HTMLElement) || !(toggle instanceof HTMLElement) || !(card instanceof HTMLElement)) {
      return { ok: false, reason: 'data panel not found' };
    }

    toggle.scrollIntoView({ block: 'nearest' });
    let uploadButton = card.querySelector('.sidebar-upload-btn');
    if (!(uploadButton instanceof HTMLElement)) {
      toggle.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      uploadButton = card.querySelector('.sidebar-upload-btn');
    }

    if (!(uploadButton instanceof HTMLElement)) {
      return { ok: false, reason: 'upload button missing' };
    }

    const bodyRect = scrollBody.getBoundingClientRect();
    const uploadRect = uploadButton.getBoundingClientRect();

    return {
      ok: uploadRect.top >= bodyRect.top && uploadRect.bottom <= bodyRect.bottom,
      reason: 'upload button pushed out of visible scroll area',
    };
  });

  if (!uploadCheck.ok) {
    throw new Error(`upload check failed: ${uploadCheck.reason}`);
  }

  const localizationPackCheck = await page.evaluate(() => {
    const packCard = document.querySelector('[data-testid="localization-pack-panel"]');

    if (!(packCard instanceof HTMLElement)) {
      return { ok: false, reason: 'localization pack card missing' };
    }

    const heading = packCard.querySelector('[data-testid="localization-pack-heading"]');
    const uploadButton = packCard.querySelector('[data-testid="localization-pack-upload-button"]');
    const builtInRow = packCard.querySelector('[data-testid="localization-pack-built-in-row"]');
    const userRow = packCard.querySelector('[data-testid="localization-pack-row-user-1"]');

    return {
      ok: Boolean(heading) && Boolean(uploadButton) && Boolean(builtInRow) && Boolean(userRow),
      reason: !heading
        ? 'localization pack heading hook missing'
        : !uploadButton
          ? 'localization pack upload button hook missing'
          : !builtInRow
            ? 'built-in localization row hook missing'
            : 'persisted localization pack row hook missing',
    };
  });

  if (!localizationPackCheck.ok) {
    throw new Error(`localization pack check failed: ${localizationPackCheck.reason}`);
  }

  const localizationPackLanguageToggleCheck = await page.evaluate(async () => {
    const packCard = document.querySelector('[data-testid="localization-pack-panel"]');
    const heading = packCard?.querySelector('[data-testid="localization-pack-heading"]');
    const builtInName = packCard?.querySelector('[data-testid="localization-pack-built-in-name"]');
    const uploadButton = packCard?.querySelector('[data-testid="localization-pack-upload-button"]');
    const toggleButton = [...document.querySelectorAll('button')].find(
      (node) => (node.textContent || '').trim() === 'EN',
    );

    if (
      !(heading instanceof HTMLElement) ||
      !(builtInName instanceof HTMLElement) ||
      !(uploadButton instanceof HTMLElement) ||
      !(toggleButton instanceof HTMLElement)
    ) {
      return { ok: false, reason: 'missing localization pack i18n hooks or language toggle' };
    }

    const zhState = {
      heading: heading.textContent?.trim(),
      builtIn: builtInName.textContent?.trim(),
      upload: uploadButton.textContent?.trim(),
    };

    toggleButton.click();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const enState = {
      heading: heading.textContent?.trim(),
      builtIn: builtInName.textContent?.trim(),
      upload: uploadButton.textContent?.trim(),
    };

    return {
      ok:
        zhState.heading !== enState.heading &&
        zhState.builtIn !== enState.builtIn &&
        zhState.upload !== enState.upload &&
        enState.heading === 'Localization Packs' &&
        enState.builtIn === 'Built-in GTCEu Modern' &&
        enState.upload?.includes('Upload lang JSON'),
      reason: 'localization pack panel did not switch labels with zh/en toggle',
    };
  });

  if (!localizationPackLanguageToggleCheck.ok) {
    throw new Error(`localization pack i18n check failed: ${localizationPackLanguageToggleCheck.reason}`);
  }

  const deleteLocalizationPackCheck = await page.evaluate(async () => {
    window.confirm = () => true;

    const packCard = document.querySelector('[data-testid="localization-pack-panel"]');
    const deleteButton = packCard?.querySelector('[data-testid="localization-pack-delete-user-1"]');

    if (!(deleteButton instanceof HTMLElement)) {
      return { ok: false, reason: 'delete button for persisted localization pack missing' };
    }

    deleteButton.click();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const rowStillPresent = Boolean(packCard?.querySelector('[data-testid="localization-pack-row-user-1"]'));
    const persisted = localStorage.getItem('gtp_localization_packs') || '';

    return {
      ok: !rowStillPresent && persisted === '[]',
      reason: rowStillPresent
        ? 'persisted localization pack row still visible after delete'
        : 'localStorage not updated after delete',
    };
  });

  if (!deleteLocalizationPackCheck.ok) {
    throw new Error(`localization pack delete check failed: ${deleteLocalizationPackCheck.reason}`);
  }

  const hasLegacyDatalist = await page.$('datalist#materials-list');
  if (hasLegacyDatalist) {
    throw new Error('search ui check failed: legacy datalist still present');
  }

  const targetInput = await page.$('.material-search input');
  if (!targetInput) {
    throw new Error('search ui check failed: material search input missing');
  }

  await targetInput.click();
  await page.waitForSelector('.material-search-dropdown', { timeout: 5000 });
  await targetInput.click({ clickCount: 3 });
  await targetInput.press('Backspace');
  await targetInput.type('#gtceu:lv_machine_hull');
  await page.waitForSelector('.material-search-dropdown .material-search-option', { timeout: 5000 });
  await page.mouse.click(4, 4);

  await targetInput.click({ clickCount: 3 });
  await targetInput.press('Backspace');
  await targetInput.type('unmatched draft');
  await page.mouse.click(4, 4);

  const rawIdPreserved = await page.evaluate(() => localStorage.getItem('gtp_target') === 'gtceu:lv_machine_hull');
  if (!rawIdPreserved) {
    throw new Error('search ui check failed: free-typed draft overwrote stored raw id');
  }

  await targetInput.click({ clickCount: 3 });
  await targetInput.press('Backspace');
  await targetInput.type('modpack:custom_item');
  await page.click('.sidebar-footer-actions .btn-primary');

  const plainRawIdRejected = solveRequests.at(-1)?.target === 'gtceu:lv_machine_hull';
  if (!plainRawIdRejected) {
    throw new Error('search ui check failed: plain raw-id target was accepted without # mode');
  }

  await targetInput.click({ clickCount: 3 });
  await targetInput.press('Backspace');
  await targetInput.type('#modpack:custom_item');
  await page.click('.sidebar-footer-actions .btn-primary');

  const explicitTargetAccepted = solveRequests.at(-1)?.target === 'modpack:custom_item';
  if (!explicitTargetAccepted) {
    throw new Error('search ui check failed: # raw-id target was not accepted');
  }

  const materialSectionHandle = await page.$('[data-testid="materials-preset-section"]');
  const materialSearchInput = await materialSectionHandle?.$('.material-search input');
  const materialAddButton = await materialSectionHandle?.$('.btn-icon');

  if (!materialSectionHandle || !materialSearchInput || !materialAddButton) {
    throw new Error('search ui check failed: preset add controls missing');
  }

  const beforeTagCount = await page.evaluate((section) => section.querySelectorAll('.tag').length, materialSectionHandle);

  await materialSearchInput.click({ clickCount: 3 });
  await materialSearchInput.press('Backspace');
  await materialSearchInput.type('#gtceu:lv_machine_hull');
  await page.waitForSelector('.material-search-dropdown .material-search-option', { timeout: 5000 });
  await page.click('.material-search-dropdown .material-search-option');
  await materialAddButton.click();

  const addedTagCheck = await page.evaluate((section) => {
    const tags = [...section.querySelectorAll('.tag')];
    const tag = tags.find((node) => (node.textContent || '').includes('gtceu:lv_machine_hull'));
    if (!tag) {
      return { ok: false, reason: 'localized added tag missing' };
    }

    const primary = tag.querySelector('.tag-primary')?.textContent?.trim();
    const secondary = tag.querySelector('.tag-secondary')?.textContent?.trim();

    return {
      ok: Boolean(primary) && primary !== secondary && secondary === 'gtceu:lv_machine_hull',
      reason: 'localized tag rendering missing primary/secondary labels',
    };
  }, materialSectionHandle);

  if (!addedTagCheck.ok) {
    throw new Error(`search ui check failed: ${addedTagCheck.reason}`);
  }

  const afterValidAddCount = await page.evaluate((section) => section.querySelectorAll('.tag').length, materialSectionHandle);
  if (afterValidAddCount !== beforeTagCount + 1) {
    throw new Error('search ui check failed: valid selected suggestion was not appended');
  }

  const beforeManualAddCount = await page.evaluate((section) => section.querySelectorAll('.tag').length, materialSectionHandle);
  await materialSearchInput.click({ clickCount: 3 });
  await materialSearchInput.press('Backspace');
  await materialSearchInput.type('modpack:custom_item');
  await materialAddButton.click();

  const afterPlainRawAddCount = await page.evaluate((section) => section.querySelectorAll('.tag').length, materialSectionHandle);
  if (afterPlainRawAddCount !== beforeManualAddCount) {
    throw new Error('search ui check failed: plain raw-id add was accepted without # mode');
  }

  await materialSearchInput.click({ clickCount: 3 });
  await materialSearchInput.press('Backspace');
  await materialSearchInput.type('#modpack:custom_item');
  await materialAddButton.click();

  const manualAddCheck = await page.evaluate((section) => {
    const tags = [...section.querySelectorAll('.tag')];
    const tag = tags.find((node) => (node.textContent || '').includes('modpack:custom_item'));

    return {
      ok: Boolean(tag),
      reason: 'manual raw-id entry was not appended',
    };
  }, materialSectionHandle);

  if (!manualAddCheck.ok) {
    throw new Error(`search ui check failed: ${manualAddCheck.reason}`);
  }

  const afterManualAddCount = await page.evaluate((section) => section.querySelectorAll('.tag').length, materialSectionHandle);
  if (afterManualAddCount !== beforeManualAddCount + 1) {
    throw new Error('search ui check failed: # raw-id add did not increase material tag count');
  }

  const whitelistSectionHandle = await page.$('[data-testid="whitelist-preset-section"]');
  const whitelistSearchInput = await whitelistSectionHandle?.$('.material-search input');
  const whitelistAddButton = await whitelistSectionHandle?.$('.btn-icon');

  if (!whitelistSectionHandle || !whitelistSearchInput || !whitelistAddButton) {
    throw new Error('search ui check failed: whitelist add controls missing');
  }

  const beforeWhitelistCount = await page.evaluate((section) => section.querySelectorAll('.tag').length, whitelistSectionHandle);
  await whitelistSearchInput.click({ clickCount: 3 });
  await whitelistSearchInput.press('Backspace');
  await whitelistSearchInput.type('#gtceu:red_alloy');
  await page.waitForSelector('.material-search-dropdown .material-search-option', { timeout: 5000 });
  await page.click('.material-search-dropdown .material-search-option');
  await whitelistSearchInput.click({ clickCount: 3 });
  await whitelistSearchInput.type('unselected draft');
  await whitelistAddButton.click();

  const afterTagCount = await page.evaluate((section) => section.querySelectorAll('.tag').length, whitelistSectionHandle);
  const presetEntryGuard = {
    ok: beforeWhitelistCount === afterTagCount,
    reason: 'preset section appended stale previously selected raw id',
  };

  if (!presetEntryGuard.ok) {
    throw new Error(`search ui check failed: ${presetEntryGuard.reason}`);
  }

  await page.waitForSelector('.react-flow', { timeout: 5000 });

  const materialCardCheck = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.flow-material-node')];
    const localizedCard = cards.find((card) => (card.textContent || '').includes('gtceu:red_alloy'));
    const rawOnlyCard = cards.find((card) => (card.textContent || '').includes('modpack:raw_gear'));

    if (!(localizedCard instanceof HTMLElement)) {
      return { ok: false, reason: 'localized yellow material card missing' };
    }

    if (!(rawOnlyCard instanceof HTMLElement)) {
      return { ok: false, reason: 'raw-only yellow material card missing' };
    }

    const localizedPrimary = localizedCard.querySelector('.flow-title')?.textContent?.trim();
    const localizedSecondary = localizedCard.querySelector('.flow-title-secondary')?.textContent?.trim();
    const rawOnlyPrimary = rawOnlyCard.querySelector('.flow-title')?.textContent?.trim();
    const rawOnlySecondary = rawOnlyCard.querySelector('.flow-title-secondary')?.textContent?.trim();

    return {
      ok:
        Boolean(localizedPrimary) &&
        localizedPrimary !== localizedSecondary &&
        localizedSecondary === 'gtceu:red_alloy' &&
        rawOnlyPrimary === 'modpack:raw_gear' &&
        !rawOnlySecondary,
      reason: 'yellow material cards missing expected localized primary/raw secondary rendering',
    };
  });

  if (!materialCardCheck.ok) {
    throw new Error(`search ui check failed: ${materialCardCheck.reason}`);
  }

  const treeExportCheck = await page.evaluate(async () => {
    const treePanel = document.querySelector('[data-testid="tree-export-panel"]');
    const firstButton = treePanel?.querySelector('[data-testid="tree-download-0"]');

    if (!(treePanel instanceof HTMLElement)) {
      return { ok: false, reason: 'tree export panel missing' };
    }

    if (!(firstButton instanceof HTMLElement)) {
      return { ok: false, reason: 'per-tree download button missing' };
    }

    firstButton.click();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const payloads = window.__downloadPayloads || [];
    const names = window.__downloadNames || [];
    const rawPayload = payloads[0];

    if (!rawPayload) {
      return { ok: false, reason: 'per-tree download did not emit payload' };
    }

    const payload = JSON.parse(rawPayload);

    return {
      ok:
        payload.tree_index === 0 &&
        payload.request?.target === 'modpack:custom_item' &&
        payload.tree?.metrics?.total_eut === 30 &&
        !('trees' in payload) &&
        typeof payload.tree === 'object' &&
        names[0] === 'modpack-custom_item-tree-1.json',
      reason: 'per-tree export payload missing request context, metrics, or single-tree shape',
    };
  });

  if (!treeExportCheck.ok) {
    throw new Error(`tree export check failed: ${treeExportCheck.reason}`);
  }

  console.log('SIDEBAR_SMOKE_OK');
} finally {
  await browser.close();
}
