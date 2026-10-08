export const dimensions = {
  definition: "定义", motivation: "需求", use: "使用", significance: "现实意义",
  relations: "概念关联", role: "整体位置", mechanism: "成立依据", boundaries: "适用边界", selection: "识别与选择"
} as const;

export type DimensionKey = keyof typeof dimensions;
