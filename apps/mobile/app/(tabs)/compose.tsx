import {Redirect} from 'expo-router';
// Native taps open the existing create sheet without changing the selected tab.
// A direct URL must not expose an empty fifth page.
export default function ComposeRoute(){return <Redirect href={'/create' as never}/>;}
