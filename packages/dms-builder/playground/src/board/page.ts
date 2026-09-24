import { Get } from "@antelopejs/interface-api";
import { Model } from "@antelopejs/interface-database-decorators";
import { User } from "@antelopejs/interface-dms/auth/db";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import {
  Category,
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import {
  ChartArea,
  ChartCard,
  ChartCardData,
  ChartColumn,
  Form,
  PeriodSelector,
  Placeholder,
  ResourceForm,
  Tab,
  VStack,
  chartCardData,
} from "@antelopejs/interface-dms/base";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { orderDataAPI } from "../order/data-api";
import { OrderModel } from "../order/database";

export const shopCategory = Category("shop", {
  displayName: "Shop",
  icon: "i-ph-storefront",
  order: 10,
  category: pagesCategory,
});

const PERIOD_SCOPE = "board-period";

/**
 * The page the reference journey is configured on: `/shop/board`.
 *
 * The chart card is placed with no `fetchUrl` on purpose. That empty option is
 * what the builder's source editor fills in — resource, measure, grouping —
 * and what it writes back, along with the model method and the route, when the
 * page is saved. Binding the source to a period writes `periodScope` too, which
 * is what the selector above the card drives.
 */
@RegisterPage()
export class PageShopBoard extends PageController("board", {
  displayName: "Board",
  icon: "i-ph-chart-line",
  category: shopCategory,
  order: 0,
  description: "Configure a chart without writing a route",
}) {
  static period = PeriodSelector({
    id: PERIOD_SCOPE,
    defaultPreset: "last-30-days",
    defaultComparison: "previous-period",
  });
  // A row between the grid and the card because a Grid takes nothing else:
  // the layout renders either way, but a whole-tree save refuses a card placed
  // straight under the grid, which is every save the source editor makes.
  static grid = Grid({ gap: "1rem" }).child("gridRow", GridRow().child("grid", Grid().child("gridRow", GridRow().child("vStack", VStack({ alignment: "stretch" }).child("tab", Tab({
    items: [
      { label: "Tab 1", slot: "tab1" },
      { label: "Tab 2", slot: "tab2", badge: { label: "aaa" } },
      { label: "Tab 3", slot: "tab3" },
    ],
  }).child("placeholder", Placeholder(), { slot: "tab2" }).child("form", Form({
    fields: [
      {
        id: "test",
        label: "aaa",
        type: new DefaultDataTypes.NumberType(),
        required: false,
        defaultValue: 66465,
      },
    ],
    title: "form",
    description: "la desc",
    submitLabel: "finir",
    submitUrl: "/test",
    submitUrlMethod: "POST",
  }), { slot: "tab3" }).child("placeholder2", Placeholder(), { slot: "tab1" })))))).child("gridRow2", GridRow()).child("row", GridRow().child("revenueChart", ChartCard({
    title: "Revenue",
    description: "Sum of paid orders, by month",
    icon: "i-ph-currency-eur",
    valueFormat: "currency",
    currencyCode: "EUR",
    showDelta: true,
    chart: ChartArea({ xaxisType: "category", smooth: true }),
  })));
  static chartCard = ChartCard({
    title: "Orders by status",
    chart: ChartColumn(),
    fetchUrl: "/shop/board/stats/chart-card",
  });
  static resourceForm = ResourceForm(orderDataAPI, {
    mode: "new",
    title: "New order",
    submitLabel: "Submit",
    successMessage: "Order created",
  });
  @Get("/stats/chart-card")
  async chartCard(
    @AuthUserWithPermission(PageShopBoard) _user: User,
    @Model(OrderModel) model: OrderModel,
  ): Promise<ChartCardData> {
    return chartCardData(await model.chartCard(), { measure: "count", label: "order" });
  }
}
