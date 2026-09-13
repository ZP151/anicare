import {createContext} from 'react';
import type {Animated} from 'react-native';
export const HeaderCollapseContext = createContext<{opacity:Animated.AnimatedInterpolation<number>;collapsed:boolean}|null>(null);
