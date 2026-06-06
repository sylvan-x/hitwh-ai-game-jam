/* global Phaser */

// =========================
// 可调参数（你可以按需求改）
// =========================
const CONFIG = {
  // 如果你在 assets/ 下放了同名 PNG，会优先加载；否则自动生成占位贴图
  externalAssets: {
    xuefeng: "./assets/xuefeng.png",
    icecream: "./assets/icecream.png",
    sprite: "./assets/sprite.png",
    snowpile: "./assets/snowpile.png",
    exam: "./assets/exam.png",
  },

  difficulties: {
    easy: { name: "简单", speed: 220, spawnEveryMs: 700 },
    normal: { name: "普通", speed: 300, spawnEveryMs: 600 },
    hard: { name: "困难", speed: 380, spawnEveryMs: 520 },
  },

  player: {
    moveSpeed: 360, // 横向/纵向移动速度（键盘）
    jumpVelocity: 680,
    gravity: 1900,
    maxJumpCount: 2, // 二段跳
  },

  itemEffects: {
    // “巧乐兹雪糕”：自动说“你跑不过我你信吗”，并开始加速并双倍得分
    icecream: { durationMs: 4000, speedMultiplier: 1.45, scoreMultiplier: 2, speech: "你跑不过我你信吗" },
    // “雪碧”：自动说“跑起来”，并且有5秒无敌状态
    sprite: { durationMs: 5000, invincible: true, speech: "跑起来" },
  },

  damage: {
    maxHp: 3,
    hurtCooldownMs: 900,
  },
};

function speakZh(text) {
  try {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    u.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (_) {
    // 忽略语音失败（某些环境不支持）
  }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// =========================
// Preload / Menu / Game
// =========================

class PreloadScene extends Phaser.Scene {
  constructor() {
    super("Preload");
  }

  preload() {
    const { width, height } = this.scale;
    const txt = this.add
      .text(width / 2, height / 2, "加载中…", { fontSize: "18px", color: "#e8eefc" })
      .setOrigin(0.5);

    this.load.on("progress", (p) => {
      txt.setText(`加载中… ${Math.round(p * 100)}%`);
    });

    // 记录素材加载失败原因，方便你排查“为什么没替换”
    this.registry.set("assetLoadErrors", []);
    this.load.on("loaderror", (file) => {
      const errs = this.registry.get("assetLoadErrors") || [];
      errs.push({ key: file.key, url: file.src || file.url || "", type: file.type || "" });
      this.registry.set("assetLoadErrors", errs);
    });

    // 尝试加载外部素材（不存在也不会阻塞，我们在 create() 里做占位贴图兜底）
    for (const [key, url] of Object.entries(CONFIG.externalAssets)) {
      this.load.image(key, url);
    }
  }

  create() {
    // 把“外部素材是否成功加载”写入 registry（否则后面会被占位贴图覆盖，无法判断）
    for (const key of Object.keys(CONFIG.externalAssets)) {
      this.registry.set(`assetLoaded:${key}`, this.textures.exists(key));
    }
    this.scene.start("Menu");
  }
}

class MenuScene extends Phaser.Scene {
  constructor() {
    super("Menu");
  }

  create() {
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0x0b1220, 1);
    this.add
      .text(width / 2, height * 0.25, "雪枫跑酷", {
        fontSize: "40px",
        color: "#ffffff",
        fontStyle: "700",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.38, "选择难度开始", { fontSize: "18px", color: "#cbd7ff" })
      .setOrigin(0.5);

    const buttons = [
      { id: "easy", label: "简单" },
      { id: "normal", label: "普通" },
      { id: "hard", label: "困难" },
    ];

    const startY = height * 0.52;
    const gap = 72;

    buttons.forEach((b, i) => {
      const y = startY + i * gap;
      const btn = this.add
        .rectangle(width / 2, y, 240, 52, 0x213058, 1)
        .setStrokeStyle(2, 0x5c78ff, 0.7)
        .setInteractive({ useHandCursor: true });
      const t = this.add.text(width / 2, y, b.label, { fontSize: "20px", color: "#ffffff" }).setOrigin(0.5);

      btn.on("pointerover", () => btn.setFillStyle(0x2b3a6a, 1));
      btn.on("pointerout", () => btn.setFillStyle(0x213058, 1));
      btn.on("pointerdown", () => {
        this.scene.start("Game", { difficulty: b.id });
      });
      t.setInteractive({ useHandCursor: true });
      t.on("pointerdown", () => btn.emit("pointerdown"));
    });

    const help = [
      "玩法：横版自动跑（天天酷跑式），你只需要跳跃/下滑来躲避障碍并吃道具。",
      "操作：空格/↑ 跳跃（二段跳），↓ 下滑/铲。",
      "道具：巧乐兹雪糕=4秒加速+双倍得分；雪碧=5秒无敌。",
    ].join("\n");
    this.add
      .text(width / 2, height * 0.86, help, { fontSize: "14px", color: "#b7c6ff", align: "center", lineSpacing: 6 })
      .setOrigin(0.5);

    // 素材加载诊断：如果你把图片放到 assets/ 但没替换，这里会提示原因
    const keys = Object.keys(CONFIG.externalAssets);
    const missing = keys.filter((k) => !this.registry.get(`assetLoaded:${k}`));
    const errs = this.registry.get("assetLoadErrors") || [];
    if (missing.length || errs.length) {
      const lines = [];
      if (missing.length) lines.push(`素材未加载：${missing.join(", ")}`);
      if (errs.length) lines.push(`加载失败：${errs.map((e) => e.key).join(", ")}`);
      lines.push("请检查：文件名是否完全一致（含 .png）、是否是真PNG、放在 xuefeng-parkour/assets/ 下，然后刷新页面。");
      this.add
        .text(width / 2, height * 0.95, lines.join("\n"), {
          fontSize: "12px",
          color: "#ffcf7a",
          align: "center",
          lineSpacing: 4,
          wordWrap: { width: Math.min(860, width - 40) },
        })
        .setOrigin(0.5);
    }
  }
}

class GameScene extends Phaser.Scene {
  constructor() {
    super("Game");
  }

  init(data) {
    const d = CONFIG.difficulties[data.difficulty] || CONFIG.difficulties.easy;
    this.difficultyId = data.difficulty || "easy";
    this.baseSpeed = d.speed;
    this.baseSpawnEveryMs = d.spawnEveryMs;
  }

  create() {
    // ===== 兜底生成贴图（如果你没提供 assets/ PNG 也能玩）=====
    this.ensureFallbackTextures();

    const { width, height } = this.scale;

    // 天天酷跑/横版自动跑：世界向左滚动，玩家主要操作跳跃/下滑
    this.groundY = Math.round(height * 0.82);
    this.scrollLeftBound = -120;

    // 背景
    this.drawRunnerBackground();

    // 物理
    this.physics.world.gravity.y = CONFIG.player.gravity;

    // 地面（静态碰撞体）
    this.ground = this.add.rectangle(width / 2, this.groundY + 36, width + 200, 72, 0x162247, 1);
    this.ground.setDepth(1);
    this.physics.add.existing(this.ground, true);

    // 状态
    this.hp = CONFIG.damage.maxHp;
    this.score = 0;
    this.scoreMultiplier = 1;
    this.speedMultiplier = 1;
    this.invincibleUntil = 0;
    this.icecreamUntil = 0;
    this.hurtCooldownUntil = 0;
    this.gameOver = false;

    // 下滑/铲
    this.slide = {
      active: false,
      until: 0,
      durationMs: 650,
    };

    // 玩家
    this.player = this.physics.add.sprite(190, this.groundY - 44, "xuefeng");
    this.player.setDepth(10);
    this.player.setCollideWorldBounds(true);
    this.player.setBounce(0);
    this.player.setDragX(2000);

    // 角色“伪跑步”摆动
    this.tweens.add({
      targets: this.player,
      angle: { from: -2, to: 2 },
      yoyo: true,
      repeat: -1,
      duration: 220,
    });

    // 碰撞地面
    this.physics.add.collider(this.player, this.ground);

    // 跳跃计数（二段跳）
    this.jumpCount = 0;

    // 记录原始碰撞盒（用于下滑时缩小）
    this.baseBody = {
      w: Math.max(18, Math.round(this.player.width * 0.55)),
      h: Math.max(32, Math.round(this.player.height * 0.75)),
    };
    // 关键：碰撞盒“贴地”对齐精灵底部，避免下滑时缩放导致“卡进地面”
    this.player.body.setSize(this.baseBody.w, this.baseBody.h);
    this.baseBody.offsetX = Math.round((this.player.width - this.baseBody.w) / 2);
    this.baseBody.offsetY = Math.round(this.player.height - this.baseBody.h);
    this.player.body.setOffset(this.baseBody.offsetX, this.baseBody.offsetY);

    // 空中平台（可站立）
    this.platforms = this.physics.add.group({ allowGravity: false, immovable: true });
    // 只允许从上方落到平台，防止从下方顶住
    this.physics.add.collider(
      this.player,
      this.platforms,
      undefined,
      (_player, platform) => {
        const pb = this.player.body;
        const ob = platform.body;
        const falling = pb.velocity.y >= 0;
        const above = pb.bottom <= ob.top + 10;
        return falling && above;
      },
      this
    );

    // 组：道具/障碍（都向左移动）
    this.pickups = this.physics.add.group({ allowGravity: false, immovable: true });
    this.obstacles = this.physics.add.group({ allowGravity: false, immovable: true });

    this.physics.add.overlap(this.player, this.pickups, this.onPickup, undefined, this);
    this.physics.add.overlap(this.player, this.obstacles, this.onHitObstacle, undefined, this);

    // 输入：键盘
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys("SPACE");

    // 输入：触屏（跳/滑按钮）
    this.createMobileControlsRunner();

    // 生成器
    this.spawnTimer = this.time.addEvent({
      delay: this.baseSpawnEveryMs,
      loop: true,
      callback: () => this.spawnSomethingRunner(),
    });

    // 用于“合理间距/组合”的生成控制
    this.lastSpawnAt = 0;
    this.lastObstacleType = null;
    this.lastObstacleAt = 0;
    // 难度越高，生成可更密，但仍保证有反应时间
    this.minSpawnMs = Math.max(320, this.baseSpawnEveryMs - 120);

    // UI
    const difficultyName = (CONFIG.difficulties[this.difficultyId] || CONFIG.difficulties.easy).name;
    this.ui = {
      hp: this.add.text(14, 12, "", { fontSize: "18px", color: "#ffffff" }).setDepth(200),
      score: this.add.text(14, 38, "", { fontSize: "16px", color: "#cbd7ff" }).setDepth(200),
      buffs: this.add.text(14, 62, "", { fontSize: "14px", color: "#9fe3ff" }).setDepth(200),
      diff: this.add
        .text(width - 14, 12, `难度：${difficultyName}`, { fontSize: "14px", color: "#b7c6ff" })
        .setOrigin(1, 0)
        .setDepth(200),
    };
    this.refreshUI();

    // 退出到菜单
    this.input.keyboard.on("keydown-ESC", () => {
      if (this.gameOver) return;
      this.scene.start("Menu");
    });
  }

  ensureFallbackTextures() {
    // 玩家
    const xuefengLoaded = this.registry.get("assetLoaded:xuefeng");
    if (!xuefengLoaded && !this.textures.exists("xuefeng")) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(0, 0, 60, 60, 12);
      g.fillStyle(0x2f5cff, 1);
      g.fillCircle(30, 28, 18);
      g.fillStyle(0x0b1220, 1);
      g.fillCircle(24, 26, 3);
      g.fillCircle(36, 26, 3);
      g.fillStyle(0x9fe3ff, 1);
      g.fillRoundedRect(16, 44, 28, 8, 4);
      g.generateTexture("xuefeng", 60, 60);
      g.destroy();
    }

    // 道具/障碍
    const simple = (key, color, label) => {
      const loaded = this.registry.get(`assetLoaded:${key}`);
      if (loaded) return;
      if (this.textures.exists(key)) return;
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(color, 1);
      g.fillRoundedRect(0, 0, 54, 54, 12);
      g.lineStyle(4, 0xffffff, 0.8);
      g.strokeRoundedRect(2, 2, 50, 50, 12);
      g.generateTexture(key, 54, 54);
      g.destroy();

      // 用一个“文字贴图”做叠加（避免导入字体问题，直接用 Text 对象在游戏里覆盖）
      this.registry.set(`${key}_label`, label);
    };

    simple("icecream", 0xffd46a, "巧");
    simple("sprite", 0x93ff9e, "碧");
    simple("snowpile", 0xe9f5ff, "雪");
    simple("exam", 0xff8ea1, "卷");

    // 平台
    if (!this.textures.exists("platform")) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x2b3a6a, 1);
      g.fillRoundedRect(0, 0, 180, 24, 10);
      g.lineStyle(2, 0x88a6ff, 0.7);
      g.strokeRoundedRect(1, 1, 178, 22, 10);
      g.generateTexture("platform", 180, 24);
      g.destroy();
    }
  }

  drawBackground() {
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x0b1220, 1);

    const g = this.add.graphics();
    g.lineStyle(1, 0x1b2a4e, 0.65);
    const grid = 48;
    for (let x = 0; x <= width; x += grid) g.lineBetween(x, 0, x, height);
    for (let y = 0; y <= height; y += grid) g.lineBetween(0, y, width, y);
    g.setDepth(0);
  }

  drawRunnerBackground() {
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x0b1220, 1);

    // 远景星点
    const g = this.add.graphics();
    g.fillStyle(0x88a6ff, 0.25);
    for (let i = 0; i < 90; i += 1) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(0, Math.round(height * 0.6));
      g.fillCircle(x, y, Phaser.Math.Between(1, 2));
    }
    g.setDepth(0);

    // 地平线
    const line = this.add.rectangle(width / 2, this.groundY + 2, width, 4, 0x243563, 1);
    line.setDepth(2);
  }

  createMobileControlsRunner() {
    const isTouch = this.sys.game.device.input.touch;
    if (!isTouch) return;

    const { width, height } = this.scale;
    const y = height - 70;

    // 跳跃按钮
    const jumpX = width - 70;
    this.jumpBtn = this.add
      .circle(jumpX, y, 46, 0x2b3a6a, 0.9)
      .setStrokeStyle(3, 0x5c78ff, 0.9)
      .setDepth(300)
      .setScrollFactor(0)
      // 命中区域扩大为圆：点到按钮/图标附近即可响应
      .setInteractive(new Phaser.Geom.Circle(0, 0, 60), Phaser.Geom.Circle.Contains, { useHandCursor: true });
    this.jumpBtnText = this.add
      .text(jumpX, y, "跳", { fontSize: "22px", color: "#ffffff", fontStyle: "700" })
      .setOrigin(0.5)
      .setDepth(301)
      .setScrollFactor(0);
    this.jumpBtnText.setInteractive({ useHandCursor: true });
    this.jumpBtn.on("pointerdown", (pointer) => {
      pointer.event?.stopPropagation?.();
      this.tryJumpRunner();
    });
    this.jumpBtnText.on("pointerdown", (pointer) => {
      pointer.event?.stopPropagation?.();
      this.tryJumpRunner();
    });

    // 下滑按钮
    const slideX = width - 160;
    this.slideBtn = this.add
      .circle(slideX, y, 46, 0x2b3a6a, 0.9)
      .setStrokeStyle(3, 0x5c78ff, 0.9)
      .setDepth(300)
      .setScrollFactor(0)
      .setInteractive(new Phaser.Geom.Circle(0, 0, 60), Phaser.Geom.Circle.Contains, { useHandCursor: true });
    this.slideBtnText = this.add
      .text(slideX, y, "滑", { fontSize: "22px", color: "#ffffff", fontStyle: "700" })
      .setOrigin(0.5)
      .setDepth(301)
      .setScrollFactor(0);
    this.slideBtnText.setInteractive({ useHandCursor: true });
    this.slideBtn.on("pointerdown", (pointer) => {
      pointer.event?.stopPropagation?.();
      this.startSlideRunner();
    });
    this.slideBtnText.on("pointerdown", (pointer) => {
      pointer.event?.stopPropagation?.();
      this.startSlideRunner();
    });
  }

  spawnSomethingRunner() {
    if (this.gameOver) return;
    const now = this.time.now;
    // 生成间距控制：避免障碍/平台挤在一起导致无解
    if (now - this.lastSpawnAt < this.minSpawnMs) return;
    this.lastSpawnAt = now;

    const r = Math.random();
    // 道具少，障碍多，偶尔出空中平台
    if (r < 0.16) this.spawnPlatformRunner();
    else if (r < 0.26) this.spawnPickupRunner("icecream");
    else if (r < 0.36) this.spawnPickupRunner("sprite");
    else this.spawnObstacleRunner();
  }

  spawnPlatformRunner() {
    const { width } = this.scale;
    // 两个高度（确保可跳上去）
    const yChoices = [this.groundY - 120, this.groundY - 160];
    const y = Phaser.Utils.Array.GetRandom(yChoices);

    const x = width + Phaser.Math.Between(120, 220);
    const p = this.platforms.create(x, y, "platform");
    p.setDepth(8);
    p.body.setAllowGravity(false);
    p.setImmovable(true);
    p.body.setSize(p.width * 0.95, p.height * 0.85);
    p.body.setOffset(p.width * 0.025, p.height * 0.1);
    p.setData("kind", "platform");
  }

  spawnPickupRunner(kind) {
    const { width } = this.scale;
    const x = width + Phaser.Math.Between(120, 220);
    // 3个高度：地面/中/空中（需要跳）
    const p = Math.random();
    let y = this.groundY - 44;
    if (p > 0.66) y = this.groundY - 160;
    else if (p > 0.33) y = this.groundY - 105;

    const s = this.pickups.create(x, y, kind);
    s.setDepth(20);
    s.body.setAllowGravity(false);
    s.setData("kind", kind);
    s.body.setSize(Math.round(s.width * 0.6), Math.round(s.height * 0.6), true);

    const label = this.registry.get(`${kind}_label`);
    if (label) {
      const t = this.add
        .text(x, y, label, { fontSize: "18px", color: "#0b1220", fontStyle: "800" })
        .setOrigin(0.5)
        .setDepth(25);
      s.setData("labelText", t);
    }
  }

  spawnObstacleRunner() {
    const { width } = this.scale;
    const kind = Math.random() < 0.5 ? "snowpile" : "exam";
    const x = width + Phaser.Math.Between(140, 260);

    // 两类障碍：
    // 1) 地面障碍：需要跳过
    // 2) 低空障碍：跳起会撞，最好下滑通过（下滑会缩小碰撞盒）
    let type = Math.random() < 0.55 ? "ground" : "lowSky";
    // 合理性：避免连续两次低空障碍（一直铲很别扭）
    if (this.lastObstacleType === "lowSky" && type === "lowSky") type = "ground";
    // 合理性：如果玩家当前在空中，不生成低空障碍（落地来不及铲）
    const onFloor = this.player?.body?.blocked?.down || this.player?.body?.touching?.down;
    if (!onFloor && type === "lowSky") type = "ground";
    // 合理性：障碍之间留出更明显的节奏（尤其是 ground ↔ lowSky 切换）
    const now = this.time.now;
    if (now - this.lastObstacleAt < 700 && this.lastObstacleType && this.lastObstacleType !== type) {
      type = this.lastObstacleType; // 让连招更可预期
    }
    this.lastObstacleType = type;
    this.lastObstacleAt = now;

    let y = this.groundY - 34;
    if (type === "lowSky") y = this.groundY - 118;

    const s = this.obstacles.create(x, y, kind);
    s.setDepth(15);
    s.body.setAllowGravity(false);
    s.setData("kind", kind);
    s.setData("type", type);

    if (type === "lowSky") {
      s.setAlpha(0.9);
      s.setScale(0.95);
    }

    // 碰撞盒略小一点更舒服
    s.body.setSize(Math.round(s.width * 0.62), Math.round(s.height * 0.62), true);

    const label = this.registry.get(`${kind}_label`);
    if (label) {
      const t = this.add
        .text(x, y, label, { fontSize: "18px", color: "#0b1220", fontStyle: "800" })
        .setOrigin(0.5)
        .setDepth(25);
      s.setData("labelText", t);
    }
  }

  onPickup(_player, pickup) {
    if (this.gameOver) return;
    const kind = pickup.getData("kind");
    pickup.getData("labelText")?.destroy();
    pickup.destroy();

    const now = this.time.now;
    if (kind === "icecream") {
      const eff = CONFIG.itemEffects.icecream;
      speakZh(eff.speech);
      this.icecreamUntil = now + eff.durationMs;
      this.speedMultiplier = eff.speedMultiplier;
      this.scoreMultiplier = eff.scoreMultiplier;
    } else if (kind === "sprite") {
      const eff = CONFIG.itemEffects.sprite;
      speakZh(eff.speech);
      this.invincibleUntil = now + eff.durationMs;
    }
    this.refreshUI();
  }

  onHitObstacle(_player, obs) {
    if (this.gameOver) return;
    const now = this.time.now;
    if (now < this.hurtCooldownUntil) return;

    // 无敌
    if (now < this.invincibleUntil) return;

    // 低空障碍：下滑时应能躲过
    if (obs.getData("type") === "lowSky" && this.slide.active && now < this.slide.until) return;

    this.hurtCooldownUntil = now + CONFIG.damage.hurtCooldownMs;
    this.hp -= 1;
    this.refreshUI();

    // 受伤闪烁
    this.tweens.add({
      targets: this.player,
      alpha: 0.2,
      yoyo: true,
      repeat: 5,
      duration: 80,
      onComplete: () => this.player.setAlpha(1),
    });

    if (this.hp <= 0) {
      this.doGameOver();
    }
  }

  doGameOver() {
    this.gameOver = true;
    this.physics.pause();
    this.spawnTimer.paused = true;

    const { width, height } = this.scale;
    const panel = this.add.rectangle(width / 2, height / 2, 520, 260, 0x0b1220, 0.92).setDepth(500);
    panel.setStrokeStyle(2, 0x5c78ff, 0.8);

    this.add
      .text(width / 2, height / 2 - 70, "游戏结束", { fontSize: "36px", color: "#ffffff", fontStyle: "800" })
      .setOrigin(0.5)
      .setDepth(501);

    this.add
      .text(width / 2, height / 2 - 20, `得分：${Math.floor(this.score)}`, { fontSize: "18px", color: "#cbd7ff" })
      .setOrigin(0.5)
      .setDepth(501);

    const btn = this.add
      .rectangle(width / 2, height / 2 + 60, 240, 52, 0x213058, 1)
      .setStrokeStyle(2, 0x5c78ff, 0.8)
      .setInteractive({ useHandCursor: true })
      .setDepth(501);
    const t = this.add.text(width / 2, height / 2 + 60, "重新开始", { fontSize: "20px", color: "#ffffff" }).setOrigin(0.5).setDepth(502);
    btn.on("pointerdown", () => this.scene.start("Menu"));
    t.setInteractive({ useHandCursor: true });
    t.on("pointerdown", () => btn.emit("pointerdown"));

    // 键盘快捷
    this.input.keyboard.once("keydown-SPACE", () => this.scene.start("Menu"));
  }

  tryJumpRunner() {
    if (this.gameOver) return;

    const onFloor = this.player.body.blocked.down || this.player.body.touching.down;
    if (onFloor) this.jumpCount = 0;
    if (this.jumpCount >= CONFIG.player.maxJumpCount) return;

    this.jumpCount += 1;
    this.player.setVelocityY(-CONFIG.player.jumpVelocity);
  }

  startSlideRunner() {
    if (this.gameOver) return;
    const now = this.time.now;
    const onFloor = this.player.body.blocked.down || this.player.body.touching.down;
    if (!onFloor) return; // 天天酷跑式：只允许在地面下滑
    if (this.slide.active && now < this.slide.until) return;

    this.slide.active = true;
    this.slide.until = now + this.slide.durationMs;

    // 缩小碰撞盒，模拟“铲”
    const newH = Math.max(22, Math.round(this.baseBody.h * 0.55));
    this.player.body.setSize(this.baseBody.w, newH);
    // 保持底部贴地：offsetY 增加（原高度 - 新高度）
    this.player.body.setOffset(this.baseBody.offsetX, this.baseBody.offsetY + (this.baseBody.h - newH));
    this.player.setScale(1.08, 0.86);
  }

  endSlideRunner() {
    this.slide.active = false;
    this.player.body.setSize(this.baseBody.w, this.baseBody.h);
    this.player.body.setOffset(this.baseBody.offsetX, this.baseBody.offsetY);
    this.player.setScale(1, 1);
  }

  refreshUI() {
    this.ui.hp.setText(`生命：${"❤".repeat(this.hp)}${"·".repeat(CONFIG.damage.maxHp - this.hp)}`);
    this.ui.score.setText(`得分：${Math.floor(this.score)}  ×${this.scoreMultiplier}`);

    const now = this.time.now;
    const buffs = [];
    if (now < this.icecreamUntil) buffs.push(`巧乐兹：${Math.ceil((this.icecreamUntil - now) / 1000)}s`);
    if (now < this.invincibleUntil) buffs.push(`无敌：${Math.ceil((this.invincibleUntil - now) / 1000)}s`);
    if (this.slide.active && now < this.slide.until) buffs.push(`下滑：${Math.ceil((this.slide.until - now) / 1000)}s`);
    this.ui.buffs.setText(buffs.length ? `状态：${buffs.join("  ")}` : "");
  }

  update(_t, dtMs) {
    if (this.gameOver) return;

    const dt = dtMs / 1000;
    const now = this.time.now;

    // Buff 结束处理
    if (this.icecreamUntil && now >= this.icecreamUntil) {
      this.icecreamUntil = 0;
      this.speedMultiplier = 1;
      this.scoreMultiplier = 1;
      this.refreshUI();
    }
    if (this.invincibleUntil && now >= this.invincibleUntil) {
      this.invincibleUntil = 0;
      this.refreshUI();
    }

    // ===== 输入：跳 / 下滑（天天酷跑式）=====
    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
      Phaser.Input.Keyboard.JustDown(this.keys.SPACE) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.up);
    if (jumpPressed) this.tryJumpRunner();

    const slidePressed = Phaser.Input.Keyboard.JustDown(this.cursors.down);
    if (slidePressed) this.startSlideRunner();

    // 落地重置二段跳
    const onFloor = this.player.body.blocked.down || this.player.body.touching.down;
    if (onFloor && this.player.body.velocity.y >= 0) this.jumpCount = 0;

    // 下滑结束
    if (this.slide.active && now >= this.slide.until) {
      this.endSlideRunner();
    }

    // ===== 场景推进：让物体往左移动（模拟自动前进）=====
    const speed = this.baseSpeed * this.speedMultiplier;
    const dx = speed * dt;

    // 得分按“距离”累计
    this.score += (dx * 0.08) * this.scoreMultiplier;

    // 移动并清理
    const moveGroup = (group) => {
      group.children.iterate((child) => {
        if (!child) return;
        child.x -= dx;
        const labelText = child.getData("labelText");
        if (labelText) {
          labelText.x = child.x;
          labelText.y = child.y;
        }
        if (child.x < this.scrollLeftBound) {
          labelText?.destroy();
          child.destroy();
        }
      });
    };
    moveGroup(this.pickups);
    moveGroup(this.obstacles);
    moveGroup(this.platforms);

    // UI刷新（不要每帧都 setText）
    if (!this._uiNextRefresh || now >= this._uiNextRefresh) {
      this._uiNextRefresh = now + 120;
      this.refreshUI();
    }

    // 轻微“无敌”可视提示
    if (now < this.invincibleUntil) {
      const p = Math.sin(now / 80) * 0.5 + 0.5;
      this.player.setTintFill(Phaser.Display.Color.GetColor(140, 255, 220));
      this.player.setAlpha(0.7 + 0.3 * p);
    } else {
      this.player.clearTint();
      this.player.setAlpha(1);
    }
  }
}

// =========================
// 启动
// =========================

const gameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#0b1220",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 540,
  },
  physics: {
    default: "arcade",
    arcade: {
      debug: false,
    },
  },
  scene: [PreloadScene, MenuScene, GameScene],
};

// eslint-disable-next-line no-new
new Phaser.Game(gameConfig);
