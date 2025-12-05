import { Redirect } from "expo-router";

export default function Index() {
  // Redirect the root "/" to the clubhouse tab
  return <Redirect href="/clubhouse" />;
}
