export BASE_REPO=$1
export SERVICE_NAMESPACE=$2
export AWS_SERVICE_NAME=$3

echo "Starting Deployment"
echo "SERVICE NAME = " + $AWS_SERVICE_NAME
# Install AWS CLI
echo " INSTALLING AWS CLI "
apk add --update python python-dev py-pip jq curl
apk upgrade -f
pip install awscli --upgrade

echo " INSTALLING KUBECTL"
curl -o kubectl https://amazon-eks.s3.us-west-2.amazonaws.com/1.15.10/2020-02-22/bin/linux/amd64/kubectl
chmod +x ./kubectl
mkdir -p $HOME/bin && cp ./kubectl $HOME/bin/kubectl && export PATH=$PATH:$HOME/bin

echo "INSTALLING IAM AUTHENTICATOR"
curl -o aws-iam-authenticator https://amazon-eks.s3.us-west-2.amazonaws.com/1.15.10/2020-02-22/bin/linux/amd64/aws-iam-authenticator
chmod +x ./aws-iam-authenticator
mkdir -p $HOME/bin && cp ./aws-iam-authenticator $HOME/bin/aws-iam-authenticator && export PATH=$PATH:$HOME/bin

echo "CONFIGURING AWS"
# Configure AWS Access Key ID
aws configure set aws_access_key_id $AWS_ACCESS_KEY_ID --profile default

# Configure AWS Secret Access Key
aws configure set aws_secret_access_key $AWS_SECRET_ACCESS_KEY --profile default

# Configure AWS default region
aws configure set region $AWS_DEFAULT_REGION --profile default

echo "LOGGING IN AWS ECR"
# Log into Amazon ECR
# aws ecr get-login returns a login command w/ a temp token
LOGIN_COMMAND=$(aws ecr get-login --no-include-email --region $AWS_DEFAULT_REGION)

# save it to an env var & use that env var to login
$LOGIN_COMMAND

# configure kubectl
echo "UPDATING kubeconfig"
aws eks update-kubeconfig --name $VIDEOWIKI_EKS_CLUSTER_NAME --region $AWS_DEFAULT_REGION
echo "UPDATING CONTAINER IMAGE"
kubectl set image deployments/$AWS_SERVICE_NAME-deployment $AWS_SERVICE_NAME=$BASE_REPO/$SERVICE_NAMESPACE/$AWS_SERVICE_NAME:${CI_COMMIT_SHA}

