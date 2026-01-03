declare module 'react-native-onboarding-swiper' {
  import { ReactNode } from 'react';
    import { StyleProp, TextStyle, ViewStyle } from 'react-native';

  export interface Page {
    backgroundColor: string;
    image: ReactNode;
    title: string;
    subtitle: string;
    titleStyles?: StyleProp<TextStyle>;
    subTitleStyles?: StyleProp<TextStyle>;
  }

  export interface OnboardingProps {
    pages: Page[];
    onDone?: () => void;
    onSkip?: () => void;
    showSkip?: boolean;
    skipLabel?: string;
    nextLabel?: string;
    containerStyles?: StyleProp<ViewStyle>;
    imageContainerStyles?: StyleProp<ViewStyle>;
    bottomBarHighlight?: boolean;
    DotComponent?: (props: { selected: boolean }) => ReactNode;
  }

  export default function Onboarding(props: OnboardingProps): JSX.Element;
}