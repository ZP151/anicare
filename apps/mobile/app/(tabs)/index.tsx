import CommunityScreen from '../community/index';

/** The Home tab stays public: it only shows the same approved community posts as /community. */
export default function HomeScreen() {
  return <CommunityScreen home />;
}
