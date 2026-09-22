# UES Evaluation Suite

UES 专家套件把网页、截图、设计稿、Demo 或产品材料转成有范围、有证据、可复核的体验评估。当前 Skill 版本为 `v0.8.0`，内部包含基础、易用性、一致性、任务、性能、虚拟用户与按需视觉质量模块。

## 安装

把下面这句话发送给 Codex：

```text
请安装这个 Skill：https://github.com/Alibaba-Cloud-Design/ues-evaluation-suite/tree/main/skills/ues-expert-suite
```

安装完成后，请新开一个对话，并用 `$ues-expert-suite` 调用。

如果需要手动安装，也可以克隆本仓库，然后把 `skills/ues-expert-suite` 目录复制到本机 Codex Skills 目录。

## 快速试用

1. 安装 Skill。
2. 在新对话中提供待评估网页、截图、设计稿或 Demo。
3. 输入：`请调用 $ues-expert-suite 完成体验评估。`
4. 如需团队练习，使用 [UES Assis Workshop](docs/workshop/ues-assis-workshop.md)。

## 仓库结构

```text
.
├── README.md
├── skills/
│   └── ues-expert-suite/        # 唯一 Skill 来源，可直接安装
└── docs/
    └── workshop/                # Workshop 文档与图片资源
```

`skills/ues-expert-suite/` 是仓库的安装入口和唯一版本来源。仓库不额外保存发布 ZIP，避免源码与压缩包出现版本分叉。

## 默认评估范围

未明确限定专项时，套件默认路由六项常规度量：

1. 基础检查
2. 易用性
3. 一致性
4. 任务分
5. 性能
6. 虚拟用户

视觉质量模块随 Skill 提供，但仅在用户明确要求视觉检测时启用。

## 版本与验证

- 当前版本：`0.8.0`
- 单体 Skill：1 个 `SKILL.md`
- 内嵌专项：7 个 `MODULE.md`
- 已通过编排、范围、HTML、视觉集成、易用性、一致性、任务评分及虚拟用户测试
