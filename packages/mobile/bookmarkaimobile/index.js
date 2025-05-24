import 'react-native-get-random-values'; // This import must be first!
import 'react-native-gesture-handler'; // This import must be second!
import {AppRegistry} from 'react-native';
import App from './src/App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
