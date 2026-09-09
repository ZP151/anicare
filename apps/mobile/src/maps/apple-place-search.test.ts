import { NativeModules, Platform } from 'react-native';
import { searchApplePlaces } from './apple-place-search';
it('sends a Singapore postcode to native search and rejects foreign or malformed points',async()=>{
 const previous=Platform.OS;Object.defineProperty(Platform,'OS',{value:'ios',configurable:true});
 const valid={id:'clementi',name:'The Clementi Mall',address:'3155 Commonwealth Avenue West',postalCode:'129588',latitude:1.315,longitude:103.765};
 NativeModules.WhiskerPlaceSearch={search:jest.fn(async()=>[valid,{...valid,latitude:51.5},{...valid,latitude:NaN}])};
 try{expect(await searchApplePlaces('129588')).toEqual([valid]);expect(NativeModules.WhiskerPlaceSearch.search).toHaveBeenCalledWith('129588');}
 finally{Object.defineProperty(Platform,'OS',{value:previous,configurable:true});delete NativeModules.WhiskerPlaceSearch;}
});
