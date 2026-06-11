export type SiteConfig = typeof siteConfig;

export const siteConfig = {
  name: "世界杯收益榜",
  description: "公司世界杯体彩收益对比看板。",
  navItems: [
    {
      label: "收益走势",
      href: "/#profit-chart",
    },
    {
      label: "数据维护",
      href: "/#data-admin",
    },
    {
      label: "个人明细",
      href: "/#profit-table",
    },
  ],
  navMenuItems: [
    {
      label: "收益走势",
      href: "/#profit-chart",
    },
    {
      label: "数据维护",
      href: "/#data-admin",
    },
    {
      label: "个人明细",
      href: "/#profit-table",
    },
  ],
  links: {
    liveline: "https://benji.org/liveline",
  },
};
