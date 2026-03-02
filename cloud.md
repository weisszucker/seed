# Seed support cloud

The new feature add cloud-syncing capability for seed.

Git and github is selected as the server provider.

Add a command "seed cloud xxx/yyy" to launch seed in cloud mode, xxx here is the github account and yyy the repo name. If the repo doesn't exist, then create one.

On the first time of launching, there would be prompt for authentication. After setup, there should be no authentication in the future.

In the cloud mode, seed pull the remote repo as currenet file status. When seed quits, the modifications made should be committed and pushed to the server. The commit title is the date. There is only commit for one day.

The fetched git repo can be kept in ~/.seed.

